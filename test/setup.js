import * as documentdb from 'documentdb';
import dockerOpts from 'dockerode-options';
import loadConfig from '../src/config';
import loadRuntime from '../src/runtime';
import denodeify from 'denodeify';
import taskcluster from 'taskcluster-client';
import fs from 'mz/fs';
import * as kueUtils from './kue';
import publisher from '../src/publisher';
import yaml from 'js-yaml';
import { exec } from 'mz/child_process';

import URL from 'url';
import PushExchange from '../src/exchanges/push';
import THProject from 'mozilla-treeherder/project';

const FIG_ROOT = __dirname;
const GENERATED_CONFIG = `${__dirname}/config.yml`;

async function figPs() {
  let [stdout, stderr] = await exec('fig ps -q', {
    cwd: FIG_ROOT
  });

  return stdout.trim().split('\n').map((v) => {
    return v.trim();
  });
}

async function figUp() {
  return await exec('fig up -d --no-recreate', { cwd: FIG_ROOT })
}

async function figKill() {
  return await exec('fig kill', { cwd: FIG_ROOT });
}

async function figPort(service, sourcePort) {
  let [ stdout ] = await exec(`fig port ${service} ${sourcePort}`, {
    cwd: FIG_ROOT
  });

  let [ host, targetPort ] = stdout.split(':');
  return parseInt(targetPort.trim(), 10);
}

suiteSetup(async function() {
  // Since we may be operating docker over vagrant/remote/etc.. It is required
  // to figure out where docker is hosted then
  let dockerConfig = dockerOpts();

  // In the case where docker is over a unix socket we fallback to 'localhost'
  let dockerHost = (dockerConfig.host || 'localhost').replace('http://', '');

  // Turn on fig (service names are hardcoded!)
  await figUp();

  // Fetch the ports we need to pass in...
  let [
    thapiPort,
    redisPort,
    rabbitmqPort
  ] = await Promise.all([
    // If your confused see test/fig.yml
    figPort('thapi', 8000),
    figPort('redis', 6379),
    figPort('rabbitmq', 5672)
  ]);

  // We use a custom config file based on src/config/test.js
  let config = await loadConfig('test', { noRaise: true });
  config.treeherder.apiUrl = `http://${dockerHost}:${thapiPort}/api/`;
  config.redis.host = dockerHost;
  config.redis.port = redisPort;
  config.commitPublisher.connectionString =
    `amqp://${dockerHost}:${rabbitmqPort}`;

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
