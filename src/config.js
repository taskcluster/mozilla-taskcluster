import path from 'path';
import fs from 'mz/fs';
import request from 'superagent';
import _ from 'lodash';
import yaml from 'js-yaml';
let Joi = require('joi');

import createConnection from './db';
import Debug from 'debug';
import Config from './collections/config';

const debug = Debug('config');
const TREEHERDER_API = 'https://treeherder.mozilla.org/api/';

async function loadYaml(location) {
  let resolved = path.resolve(location);
  let content = await fs.readFile(resolved, 'utf8');

  return yaml.safeLoad(content);
}

// Schema used to ensure we have all the correct configuration values prior to
// running any more complex logic...
let schema = Joi.object().keys({

  mongo: Joi.object().keys({
    connectionString: Joi.string().
      description('Mongodb connection string').
        default(Joi.ref('$env.MONGO_URL')),
  }),

  documentdb: Joi.object().keys({
    collectionPrefix: Joi.string().description('prefix to use before collection name'),
    host: Joi.string().description('documentdb hostname'),
    key: Joi.string().description('master or secondary read/write key'),
    database: Joi.string().required().description('database name')
  }),

  config: Joi.object().required().keys({
    documentkey: Joi.string().
      description('documentdb key of location to fetch additional configs'),

    files: Joi.array().includes(Joi.string()).
      description('list of additional files to load / merge'),
    projectsYmlUrl: Joi.string().
      description('URL of hg.mozilla.org/ci/ci-configuration/projects.yml describing Gecko branches')
  }),

  treeherderProxy: Joi.object().keys({
    port: Joi.number().required()
  }),

  treeherder: Joi.object().keys({
    apiUrl: Joi.string().required().
      description('location of treeherder api (must end in /api/)'),

    credentials: Joi.object().required().keys({
      clientId: Joi.string().required(),
      secret: Joi.string().required()
    }).description('Hawk credentials for Treeherder API')
  }),

  treeherderActions: Joi.object().keys({
    routePrefix: Joi.string().required(),
    connectionString: Joi.string().required(),
    exchange: Joi.string().required().
      description('Exchange to listen on'),
    queue: Joi.string(),
    prefetch: Joi.number().required()
  }),

  treeherderTaskcluster: Joi.object().keys({
    connectionString: Joi.string().required(),
    routePrefix: Joi.string().required().
      description('routing key prefix for taskcluster-treehreder'),
    queue: Joi.string(),
    prefetch: Joi.number().required()
  }),

  taskcluster: Joi.object().keys({
    credentials: Joi.object().keys({
      clientId: Joi.string().
        default(Joi.ref('$env.TASKCLUSTER_CLIENT_ID')),
      accessToken: Joi.string().
        default(Joi.ref('$env.TASKCLUSTER_ACCESS_TOKEN'))
    })
  }),

  try: Joi.object().keys({
    enabled: Joi.boolean().required(),
    tcYamlUrl: Joi.string().required().
      description('Default url (with mustache params) to use to fetch an in-tree .taskcluster.yml graph'),
    defaultUrl: Joi.string().required().
      description('Default url (with mustache params) to use to fetch taskgraph'),

    errorTask: Joi.string().required().
      description('The "error" task to use if we cannot parse the yaml'),

    projects: Joi.object().pattern(/.*/, Joi.object({
      level: [Joi.number(), Joi.string()],
      scopes: Joi.array(),
      url: Joi.string(),
      contains: Joi.string()
    }))
  }),

  kue: Joi.object().keys({
    purgeCompleted: Joi.boolean(),
    logFailedJobs: Joi.boolean(),
    prefix: Joi.string().required(),
    admin: Joi.object().keys({
      port: Joi.number().default(60024)
    })
  }).unknown(true),

  repositoryMonitor: Joi.object().keys({
    interval: Joi.number().required().
      description(`
        Interval between when checking invidual repositories. When repositories
        are busy no checking occurs.
      `),

    maxPushFetches: Joi.number().required().
      description(`
        Number of missing pushes to fetch if current push id < then current
        changelog push id (most recent N are fetched in ascending order).
      `.trim())
  }),

  commitPublisher: Joi.object().keys({
    connectionString: Joi.string().required(),
    exchangePrefix: Joi.string().required(),
    title: Joi.string().trim().required(),
    description: Joi.string().required()
  })
}).unknown(true);

async function projectsConfig(url) {
  let res = await request.get(url);
  let projectsYml = yaml.safeLoad(res.text);

  let projects = {};
  for (let alias of Object.keys(projectsYml)) {
    let pb = projectsYml[alias];
    if (!pb.features || !pb.features['taskcluster-push-via-mozilla-taskcluster']) {
      debug('skipping production branch ' + alias + ': taskcluster-push-via-mozilla-taskcluster feature not enabled');
      continue;
    }
    if (pb.repo_type !== 'hg') {
      debug('skipping production branch ' + alias + ': not an hg repo');
      continue;
    }

    let level = /^scm_(nss|versioncontrol|level_([123]))$/.exec(pb.access);
    if (!level) {
      debug('skipping production branch ' + alias + ': unrecognized access ' + pb.access);
      continue;
    }
    if (level[2]) {
      level = parseInt(level[2], 10);
    } else {
      level = level[1];
    }

    let repourl = /^https:\/\/(hg\.mozilla\.org\/.*)$/.exec(pb.repo);
    if (!repourl) {
      debug('skipping production branch ' + alias + ': unrecognized repo URL ' + pb.repo);
      continue;
    }
    // use the scope for the default branch; we do not use in-repo branches anyway
    let scope = 'assume:repo:' + repourl[1] + ':branch:default';

    projects[alias] = {
      level,
      scopes: [scope],
    }
  }

  // return a config override, including the confusingly-named `try` toplevel key
  return {try: {projects}}
}

export default async function load(profile, options = {}) {
  let defaultConfig = await loadYaml(
    path.join(__dirname, '..', 'src', 'config', 'default.yml')
  );

  let profileConfig = await loadYaml(
    path.join(__dirname, '..', 'src', 'config', `${profile}.yml`)
  );

  let baseConfig = _.merge(
      {},
      defaultConfig,
      profileConfig,
      options.overrides || {});

  // extend the base config with additional parameters from files...
  let extraYamlConfigFiles = (baseConfig.config.files || []);
  if (extraYamlConfigFiles.length) {
    debug('Loading additional configs', extraYamlConfigFiles);
    for (let yamlConfigFile of extraYamlConfigFiles) {
      // Convert the path to be relative to the root of the project...
      let yamlConfigPath = path.join(__dirname, '..', yamlConfigFile);

      // Skip any config files which do not exist they are not required...
      if (!await fs.exists(yamlConfigPath)) {
        debug('skip config', yamlConfigPath);
        continue;
      }

      let config = await loadYaml(yamlConfigPath);
      baseConfig = _.merge(baseConfig, config);
      debug('added config', yamlConfigPath);
    }
  }
  // Load additional configuration from the database...
  if (baseConfig.config.documentkey) {
    let db = await createConnection(baseConfig.mongo.connectionString)
    let configCollection = await Config.create(db);
    debug('fetching document', baseConfig.config.documentkey);
    let doc = await configCollection.findById(baseConfig.config.documentkey);
    baseConfig = _.merge(baseConfig, doc);
  }

  // Load additional configuration from production-branches.json
  if (baseConfig.config.projectsYmlUrl) {
    let pbConfig = await projectsConfig(baseConfig.config.projectsYmlUrl);
    baseConfig = _.merge(baseConfig, pbConfig);
  }

  let result = Joi.validate(
    baseConfig,
    schema,
    {
      context: {
        env: process.env
      }
    }
  );

  if (!options.noRaise && result.error) {
    // Annotate give us _really_ pretty error messages.
    throw new Error(result.error.annotate());
  }
  return result.value;
};
