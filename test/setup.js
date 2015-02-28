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
import yaml from 'js-yaml';
import { exec } from 'mz/child_process';

import URL from 'url';
import PushExchange from '../src/exchanges/push';
import THProject from 'mozilla-treeherder/project';

const COMPOSE_ROOT = __dirname;
const GENERATED_CONFIG = `${__dirname}/config.yml`;
const waitForPort = denodeify(_waitForPort);

suiteSetup(async function() {
  // This might take a long time since we install compose and potentially pull
  // docker images etc...
  this.timeout('2m');

  let compose = this.compose = await installCompose();

  // Turn on fig (service names are hardcoded!)
  await compose.up(COMPOSE_ROOT);

  // Fetch the ports we need to pass in...
  let [
    thapiPort,
    redisPort,
    rabbitmqPort
  ] = await Promise.all([
    // If your confused see test/docker-compose.yml
    compose.portByName(COMPOSE_ROOT, 'thapi', 8000),
    compose.portByName(COMPOSE_ROOT, 'redis', 6379),
    compose.portByName(COMPOSE_ROOT, 'rabbitmq', 5672)
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
      waitForPort(compose.host, rabbitmqPort, portRetryOpts)
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
  config.treeherder.apiUrl = `http://${compose.host}:${thapiPort}/api/`;
  config.redis.host = compose.host;
  config.redis.port = redisPort;
  config.commitPublisher.connectionString =
    `amqp://${compose.host}:${rabbitmqPort}`;

  // write out the custom config...
  await fs.writeFile(GENERATED_CONFIG, yaml.safeDump(config));

  this.config = await loadConfig('test');
  this.runtime = await loadRuntime(this.config);

  // Note listener is for messages/exchanges we generate...
  this.listener = new taskcluster.AMQPListener({
    connectionString: this.config.commitPublisher.connectionString
  });

  // Pulse is for things external components generate...
  this.pulse = new taskcluster.PulseListener({
    credentials: this.config.pulse
  });

  this.queue = new taskcluster.Queue({
    credentials: this.config.taskcluster.credentials
  });

  this.scheduler = new taskcluster.Scheduler({
    credentials: this.config.taskcluster.credentials
  });

  let commitPublisher = await publisher(this.config.commitPublisher);
  await commitPublisher.assertExchanges(PushExchange);

  // We only need the connection to assert the exchanges after that we can
  // shut it down...
  await commitPublisher.close();

  let Client = taskcluster.createClient(commitPublisher.toSchema(
    PushExchange
  ));

  this.pushEvents = new Client();
  this.treeherder = new THProject('try', {
    consumerKey: 'try',
    consumerSecret: 'try',
    baseUrl: this.config.treeherder.apiUrl
  });

  this.runtime.jobs.on('failed attempt', function(result) {
    console.error('Failed job', result);
  });
});

suiteTeardown(async function() {
  let Jobs = this.runtime.kue.Job;
  let jobs = this.runtime.jobs;

  // Ensure listener is closed...
  await Promise.all([
    this.listener.close(),
    this.runtime.db.destroy()
  ]);

  // Ensure redis connection is shutdown...
  await denodeify(jobs.shutdown).call(jobs);
});
