#! /usr/bin/env node

/**
Integrates taskcluster tasks / graphs with treeherder
*/

import '6to5/polyfill';
import cli from '../cli';
import taskcluster from 'taskcluster-client';
import createHandler from '../../src/treeherder/handler';

cli(async function main(runtime, config) {
  let queueEvents = new taskcluster.QueueEvents();
  let listener = new taskcluster.PulseListener({
    credentials: config.pulse,
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
    listener.bind(queueEvents.taskDefined(routingPattern)),
    listener.bind(queueEvents.taskPending(routingPattern)),
    listener.bind(queueEvents.taskRunning(routingPattern)),
    listener.bind(queueEvents.taskCompleted(routingPattern)),
    listener.bind(queueEvents.taskFailed(routingPattern))
  ]);

  // Spin up the handler and let it run...
  await createHandler(config, listener);
});
