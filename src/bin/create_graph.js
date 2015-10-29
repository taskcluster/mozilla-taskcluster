#! /usr/bin/env node
/**
 * Inject a task graph (utility script)
 */

import 'babel/polyfill';
import loadConfig from '../config';
import createRuntime from '../runtime';

import { ArgumentParser } from 'argparse';
import TaskclusterGraphJob from '../jobs/taskcluster_graph';

async function run(fn) {
  let parser = new ArgumentParser();
  parser.addArgument(['profile'], {
    help: 'Configuration profile to use'
  });

  parser.addArgument(['repo'], {
    help: 'Repository alias'
  });

  parser.addArgument(['pushid'], {
    help: 'Pushlog id'
  });

  parser.addArgument(['revision_hash'], {
    help: 'Treeherder revision hash'
  });

  try {
    let args = parser.parseArgs();
    let config = await loadConfig(process.argv[2]);
    let runtime = await createRuntime(config);

    await fn(runtime, config, args);
  } catch (err) {
    setTimeout(() => {
      throw err;
    });
  }
}

run(async function main(runtime, config, args) {
  let [repo] = await runtime.repositories.find({ alias: args.repo });
  let { pushid, revision_hash } = args;

  let job = new TaskclusterGraphJob({
    config: config,
    runtime: runtime
  });

  await job.work({
    data: {
      pushref: { id: pushid },
      repo: repo,
      revision_hash: revision_hash
    }
  });

  process.exit();
});

