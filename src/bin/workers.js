#! /usr/bin/env node
/**
Works the "kue" for pushes and emits amqp events.
*/

import '6to5/polyfill';
import cli from '../cli';
import publisher from '../publisher';

import PushExchange from '../exchanges/push';
import Monitor from '../repository_monitor/monitor';
import PublishPushJob from '../jobs/publish_push';
import TreeherderResultsetJob from '../jobs/treeherder_resultset';

// Time allowed for running jobs to complete before killing...
const KUE_SHUTDOWN_GRACE = 5000;

function work(fn) {
  return function(value, done) {
    fn(value)
      .then((...args) => {
        done(null, ...args);
      })
      .catch(done);
  }
}

cli(async function main(runtime, config) {
  let commitPublisher = await publisher(config.commitPublisher);
  await commitPublisher.assertExchanges(
    PushExchange
  );

  // graceful shutdown
  process.once('SIGTERM', () => {
    runtime.jobs.shutdown((err) => {
      if (err) {
        console.error(err)
      }
      process.exit(0);
    }, KUE_SHUTDOWN_GRACE);
  });

  // Start interval promotion (should only run one of these)...
  runtime.jobs.promote(config.treeherder.credentials);

  // Process the incoming pushes....
  runtime.jobs.process('publish-push', 100, work(
    PublishPushJob.bind(this, commitPublisher)
  ));

  // Treeherder resultset pushes.
  let thCreds = JSON.parse(config.treeherder.credentials);
  runtime.jobs.process('treeherder-resultset', 100, work(
    TreeherderResultsetJob.bind(this, thCreds, config.treeherder)
  ));
});
