#! /usr/bin/env node
/**
The repository monitor watches for any changes in mozilla hg repositories.
*/

import '6to5/polyfill';
import loadConfig from '../config';
import createRuntime from '../runtime';
import Monitor from '../repository_monitor/monitor';

import { ArgumentParser } from 'argparse';

let parser = new ArgumentParser();
parser.addArgument(['profile'], {
  help: 'Configuration profile to use'
});

async function main() {
  let argv = parser.parseArgs();

  let config = await loadConfig(process.argv[2]);
  let runtime = await createRuntime(config);

  let monitor = new Monitor(runtime.kue, runtime.repositories);
  await  monitor.start();
}

main().catch((err) => {
  setTimeout(() => { throw err; });
})

