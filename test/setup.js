import assert from 'assert';
import * as documentdb from 'documentdb';
import { install as installCompose } from './compose';
import loadConfig from '../src/config';
import loadRuntime from '../src/runtime';
import denodeify from 'denodeify';
import taskcluster from 'taskcluster-client';
import _waitForPort from 'wait-for-port';
import fs from 'mz/fs';
import * as kueUtils from './kue';
import publisher from '../src/publisher';
import slugid from 'slugid';
import yaml from 'js-yaml';
import { exec } from 'mz/child_process';

import URL from 'url';
import PushExchange from '../src/exchanges/push';
import RetriggerExchange from '../src/exchanges/retrigger';
import THProject from 'mozilla-treeherder/project';

const COMPOSE_ROOT = __dirname;
const GENERATED_CONFIG = `${__dirname}/config.yml`;
const waitForPort = denodeify(_waitForPort);


suiteSetup(async function() {
  // This might take a long time since we install compose and potentially pull
  // docker images etc...
  this.timeout('4m');

  // Ensure we remove the generated config so we don't end up loading it prior
  // to updating it.
  if (await fs.exists(GENERATED_CONFIG)) {
    await fs.unlink(GENERATED_CONFIG);
  }

  let compose = this.compose = await installCompose();

  // Turn on fig (service names are hardcoded!)
  await compose.up(COMPOSE_ROOT);

  // Fetch the ports we need to pass in...
  let [
    thapiPort,
    redisPort,
    rabbitmqPort,
    mongoPort
  ] = await Promise.all([
    // If your confused see test/docker-compose.yml
    compose.portByName(COMPOSE_ROOT, 'thapi', 8000),
    compose.portByName(COMPOSE_ROOT, 'redis', 6379),
    compose.portByName(COMPOSE_ROOT, 'rabbitmq', 5672),
    compose.portByName(COMPOSE_ROOT, 'mongo', 27017)
  ]);

  // The treeherder init process is far from fast so we increase the default
  // timeout values to give ourselves a better chance for success...
  let portRetryOpts = {
    numRetries: 2000,
    retryInterval: 100
  };

  // Ensure all these ports are accessible before running tests...
  try {
    await Promise.all([
      waitForPort(compose.host, thapiPort, portRetryOpts),
      waitForPort(compose.host, redisPort, portRetryOpts),
      waitForPort(compose.host, rabbitmqPort, portRetryOpts),
      waitForPort(compose.host, mongoPort, portRetryOpts)
    ]);
  } catch (e) {
    throw new Error(`
      Could not connect to one or more docker-compose services for tests this
      probably indicates a problem with docker or docker-compose setup.

      Raw Error:

      ${e.stack}
    `);
  }

  // We use a custom config file based on src/config/test.js
  let config = await loadConfig('test', { noRaise: true });
  let amqpConnectionString =
    `amqp://guest:guest@${compose.host}:${rabbitmqPort}`;

  config.treeherder.apiUrl = `http://${compose.host}:${thapiPort}/api/`;
  config.redis.host = compose.host;
  config.redis.port = redisPort;

  config.mongo.connectionString = `mongodb://${compose.host}:${mongoPort}`;

  // Documentdb collections should have unique prefixes per test process...
  config.documentdb.collectionPrefix = slugid.v4() + '-';

  // The commit publisher and the treeherder consumers need messages from within
  // the docker network so configure those accordingly.
  config.commitPublisher.connectionString = amqpConnectionString;
  config.treeherderActions.connectionString = amqpConnectionString;
  config.treeherderTaskcluster.routePrefix = `test-tc-${slugid.v4()}`

  // start with new kue each time...
  config.kue.prefix = slugid.v4();

  // write out the custom config...
  await fs.writeFile(GENERATED_CONFIG, yaml.safeDump(config));

  this.config = await loadConfig('test');
  this.runtime = await loadRuntime(this.config);

  this.queue = new taskcluster.Queue({
    credentials: this.config.taskcluster.credentials
  });

  this.scheduler = new taskcluster.Scheduler({
    credentials: this.config.taskcluster.credentials
  });

  let commitPublisher = await publisher(this.config.commitPublisher);
  await commitPublisher.assertExchanges(
    PushExchange,
    RetriggerExchange,
    // Dummy exchange for test messages from treeherder...
    {
      config: {
        exchange: 'treeherder-job-actions'
      }
    }
  );

  // We only need the connection to assert the exchanges after that we can
  // shut it down...
  await commitPublisher.close();

  this.events = new (taskcluster.createClient(commitPublisher.toSchema(
    PushExchange,
    RetriggerExchange
  )))();

  this.treeherder = new THProject('try', {
    consumerKey: 'try',
    consumerSecret: 'try',
    baseUrl: this.config.treeherder.apiUrl
  });
});

setup(function() {
  // Note listener is for messages/exchanges we generate...
  this.listener = new taskcluster.AMQPListener({
    connectionString: this.config.commitPublisher.connectionString
  });

  // Pulse is for things external components generate...
  this.pulse = new taskcluster.PulseListener({
    credentials: {
      connectionString: this.config.treeherderTaskcluster.connectionString
    }
  });
});

teardown(async function() {
  await Promise.all([
    this.listener.close(),
    this.pulse.close()
  ]);
});

suiteTeardown(async function() {
  let Jobs = this.runtime.kue.Job;
  let jobs = this.runtime.jobs;

  await this.runtime.db.dropDatabase();
  await this.listener.close();
  // Ensure redis connection is shutdown...
  await denodeify(jobs.shutdown).call(jobs);
});
