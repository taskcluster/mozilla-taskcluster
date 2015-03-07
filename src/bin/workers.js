#! /usr/bin/env node
/**
Works the "kue" for pushes and emits amqp events.
*/

import 'babel/polyfill';
import cli from '../cli';
import createPublisher from '../publisher';

import PushExchange from '../exchanges/push';
import RetriggerExchange from '../exchanges/retrigger';

import PublishPushJob from '../jobs/publish_push';
import TreeherderResultsetJob from '../jobs/treeherder_resultset';
import TaskclusterGraphJob from '../jobs/taskcluster_graph';
import TaskRetriggerJob from '../jobs/retrigger';

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
  let publisher = await createPublisher(config.commitPublisher);
  await publisher.assertExchanges(
    PushExchange, RetriggerExchange
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
  // Ensure we don't let jobs get stuck in idle state somehow for long periods
  // of time...
  runtime.jobs.watchStuckJobs();

  // Clear any completed jobs from the redis queue we only care about errors...
  if (config.kue.purgeCompleted) {
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
  }

  if (config.kue.logFailedJobs) {
    runtime.jobs.on('job failed attempt', function(id) {
      runtime.kue.Job.get(id, function(err, job) {
        console.error('Failed job', job, err);
      });
    });
  }

  // Process the incoming pushes....
  runtime.jobs.process('publish-push', 100, work(
    PublishPushJob,
    {
      runtime,
      config,
      publisher
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

  // Task retriggers...
  runtime.jobs.process('retrigger', 300, work(
    TaskRetriggerJob,
    {
      runtime,
      config,
      publisher
    }
  ))
});
