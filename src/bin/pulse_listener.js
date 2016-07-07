#! /usr/bin/env node

/**
Integrates taskcluster tasks / graphs with treeherder
*/

import 'babel/polyfill';
import cli from '../cli';
import taskcluster from 'taskcluster-client';
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

cli(async function main(runtime, config) {
  await setupActionHandler(runtime, config)
});
