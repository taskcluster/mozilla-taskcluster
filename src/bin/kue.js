#! /usr/bin/env node

/**
Starts kue admin interface.
*/

import '6to5/polyfill';
import createRuntime from '../runtime';
import loadConfig from '../config'
import kue from 'kue';

import { ArgumentParser } from 'argparse';

let parser = new ArgumentParser();
parser.addArgument(['profile'], {
  help: 'Configuration profile to use'
});

async function main() {
  let argv = parser.parseArgs();

  let config = await loadConfig(process.argv[2]);
  let runtime = await createRuntime(config);

  kue.app.listen(config.kue.admin.port, function() {
    console.log(`started kue admin on port ${config.kue.admin.port}`);
  });
}

main().catch((e) => {
  setTimeout(() => {
    throw e;
  });
});
