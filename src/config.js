import { Provider } from 'nconf';
import path from 'path';
import fs from 'mz/fs';
import denodeify from 'denodeify';
import * as Joi from 'joi';

const TREEHERDER_API = 'https://treeherder.mozilla.org/api/';

// Schema used to ensure we have all the correct configuration values prior to
// running any more complex logic...
let schema = Joi.object().keys({
  documentdb: Joi.object().keys({
    host: Joi.string().required().description('documentdb hostname'),
    key: Joi.string().required().description('master or secondary read/write key'),
    database: Joi.string().required().description('database name')
  }),

  treeherderProxy: Joi.object().keys({
    port: Joi.number().default(process.env.PORT || 60025)
  }),

  treeherder: Joi.object().keys({
    apiUrl: Joi.string().default('http://thapi:8080/api/'),
    credentials: Joi.string().
      description('entire treeherder/etl/data/credentials.json file')
  }),

  taskcluster: Joi.object().keys({
    credentials: Joi.object().keys({
      clientId: Joi.string().required().
        default(Joi.ref('env.TASKCLUSTER_CLIENT_ID')),
      accessToken: Joi.string().required().
        default(Joi.ref('env.TASKCLUSTER_ACCESS_TOKEN'))
    })
  }),

  try: Joi.object().keys({
    defaultUrl: Joi.string().required().
      description('Default url (with mustache params) to use to fetch taskgraph'),

    defaultScopes:
      Joi.array().includes(Joi.string()).required().
        description('List of default scopes to restrict graph to'),

    projects: Joi.object().pattern(/.*/, Joi.object({
      scopes: Joi.array(),
      url: Joi.string()
    }))
  }),

  redis: Joi.object().keys({
    host: Joi.string().required()
  }).unknown(true),

  kue: Joi.object().keys({
    prefix: Joi.string().required(),
    admin: Joi.object().keys({
      port: Joi.number().default(60024)
    })
  }).unknown(true),

  repositoryMonitor: Joi.object().keys({
    interval: Joi.number().default(2000).
      description(`
        Interval between when checking invidual repositories. When repositories
        are busy no checking occurs.
      `),

    maxPushFetches: Joi.number().default(200).
      description(`
        Number of missing pushes to fetch if current push id < then current
        changelog push id (most recent N are fetched in ascending order).
      `.trim())
  }),

  // Note pulse is _only_ used for consuming messages and not publishing them
  pulse: Joi.object().keys({
    username: Joi.string().required().
      default(Joi.ref('env.PULSE_USERNAME')),
    password: Joi.string().required().
      default(Joi.ref('env.PULSE_PASSWORD'))
  }),

  commitPublisher: Joi.object().keys({
    connectionString: Joi.string().required(),
    exchangePrefix: Joi.string(),
    title: Joi.string().trim().default(`
      Pushlog Commit Events
    `),
    description: Joi.string().default(`
      The pushlog events can be used to hook various other components into
      the act of commiting to a particuar repository (usually to kick off tests)
      this exchange is hopefuly a short lived thing which abstracts polling the
      pushlog for new data.

      Pushes will be monitored (via polling) and events will be sent as new data
      is available. If for some reason the service goes down previous commits
      will also be fetched and any missing data (up to a particular amount) will
      be sent as events...
    `)
  })
}).unknown(true);

export default async function load(file) {
  // Fallback to one of our preconfiged files...
  if (!await fs.exists(file)) {
    file = path.join(__dirname, 'config', file);
  }

  let baseName = path.basename(file).split('.')[0];

  let conf = new Provider().
    file(path.join(process.cwd(), `${baseName}-treeherder-proxy.json`)).
    overrides(require(file)).
    defaults(require('./config/default'));

  let initial = await denodeify(conf.load.bind(conf))();
  let result = Joi.validate(
    initial,
    schema,
    {
      context: {
        env: process.env
      }
    }
  );

  if (result.error) throw result.error;
  return result.value;
};
