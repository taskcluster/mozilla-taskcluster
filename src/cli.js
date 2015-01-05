import loadConfig from './config';
import createRuntime from './runtime';

import { ArgumentParser } from 'argparse';

export default async function(fn) {
  let parser = new ArgumentParser();
  parser.addArgument(['profile'], {
    help: 'Configuration profile to use'
  });

  try {
    let argv = parser.parseArgs();
    let config = await loadConfig(process.argv[2]);
    let runtime = await createRuntime(config);

    await fn(runtime, config);
    console.log('<starting>');

  } catch (err) {
    setTimeout(() => {
      throw err;
    });
  }
}
