#! /usr/bin/env node
/**
The repository monitor watches for any changes in mozilla hg repositories.
*/

import 'babel/polyfill';
import cli from '../cli';

import Monitor from '../repository_monitor/monitor';

cli(async function main(runtime, config) {
  let monitor = new Monitor(
    runtime.jobs,
    runtime.repositories,
    config.repositoryMonitor
  );
  await monitor.start();
});
