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
import TaskclusterGraphJob from '../jobs/taskcluster_graph';

// Time allowed for running jobs to complete before killing...
const KUE_SHUTDOWN_GRACE = 5000;

function work(jobClass, config = {}) {
  let instance = new jobClass(config);

  return function(value, done) {
    instance.work(value)
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
  runtime.jobs.promote();

  // Clear any completed jobs from the redis queue we only care about errors...
  runtime.jobs.on('job complete', function(id, result){
    runtime.kue.Job.get(id, function(err, job) {
      if (err) return;
      job.remove(function(err){
        if (err) {
          console.error('error removing job:', err);
        }
      });
    });
  });

  // Process the incoming pushes....
  runtime.jobs.process('publish-push', 100, work(
    PublishPushJob,
    {
      runtime,
      config,
      publisher: commitPublisher
    }
  ));

  // Create resultsets on push...
  runtime.jobs.process('treeherder-resultset', 50, work(
    TreeherderResultsetJob,
    {
      runtime,
      config
    }
  ));

  // Post task graphs...
  runtime.jobs.process('taskcluster-graph', 100, work(
    TaskclusterGraphJob,
    {
      runtime,
      config
    }
  ));
});
