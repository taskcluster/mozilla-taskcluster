#! /usr/bin/env node

/**
Integrates taskcluster tasks / graphs with treeherder
*/

import 'babel/polyfill';
import cli from '../cli';
import taskcluster from 'taskcluster-client';
import createJobHandler from '../../src/treeherder/job_handler';
import createActionHandler from '../../src/treeherder/action_handler';

async function setupActionHandler(runtime, config) {
  let listener = new taskcluster.PulseListener({
    credentials: {
      connectionString: config.treeherderActions.connectionString
    },
    queueName: config.treeherderActions.queue,
    prefetch: config.treeherderActions.prefetch
  });

  let routingPattern = [
    config.treeherderActions.routePrefix,
    '#'
  ].join('.');

  let binding = {
    exchange: config.treeherderActions.exchange,
    routingKeyPattern: routingPattern
  };

  await Promise.all([
    listener.bind(binding)
  ]);

  await createActionHandler(config, listener);
}

async function setupJobHandler(runtime, config) {
  let queueEvents = new taskcluster.QueueEvents();
  let listener = new taskcluster.PulseListener({
    credentials: {
      connectionString: config.treeherderTaskcluster.connectionString
    },
    queueName: config.treeherderTaskcluster.queue,
    prefetch: config.treeherderTaskcluster.prefetch
  });

  let routingPattern = [
    'route',
    config.treeherderTaskcluster.routePrefix,
    '*',
    '*'
  ].join('.');

  await Promise.all([
    listener.bind(queueEvents.taskPending(routingPattern)),
    listener.bind(queueEvents.taskRunning(routingPattern)),
    listener.bind(queueEvents.taskCompleted(routingPattern)),
    listener.bind(queueEvents.taskFailed(routingPattern)),
    listener.bind(queueEvents.taskException(routingPattern))
  ]);

  // Spin up the handler and let it run...
  await createJobHandler(config, listener);
}

cli(async function main(runtime, config) {
  await Promise.all([
    setupJobHandler(runtime, config),
    setupActionHandler(runtime, config)
  ])
});
