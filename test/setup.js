import * as documentdb from 'documentdb';
import loadConfig from '../src/config';
import loadRuntime from '../src/runtime';
import denodeify from 'denodeify';
import { createClient, AMQPListener } from 'taskcluster-client';
import * as kueUtils from './kue';
import PushExchange from '../src/exchanges/push';

suiteSetup(async function() {
  this.config = await loadConfig(__dirname + '/../src/config/test.js');
  this.runtime = await loadRuntime(this.config);
  this.listener = new AMQPListener({
    connectionString: this.config.commitPublisher.connectionString
  });

  let Client = createClient(this.runtime.commitPublisher.toSchema(
    PushExchange
  ));

  this.pushEvents = new Client();
});

suiteTeardown(async function() {
  let Jobs = this.runtime.kue.Job;
  let jobs = this.runtime.jobs;

  await kueUtils.clear(this.runtime);
});
