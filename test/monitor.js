import createProc from './process';
import * as kueUtils from './kue';
import createHg from './hg';

export default function setup(...processes) {
  let results = {
    alias: 'try',
    hg: null,
    processes: []
  };

  let url;
  suiteSetup(async function() {
    results.hg = await createHg(this.compose);
    results.url = results.hg.url;
  });

  let repos, monitor, pushworker, repo;
  suiteSetup(async function() {
    repos = this.runtime.repositories;
    repo = await repos.create({
      url: results.url,
      alias: results.alias
    });

    processes = ['pushlog_monitor.js'].concat(processes);
    results.processes = await Promise.all(processes.map((path) => {
      return createProc(path);
    }));
  });

  teardown(async function() {
    // ensure we clear old kue jobs between tests...
    let now = Date.now();
    await kueUtils.clear(this.runtime);
  });

  suiteTeardown(async function() {
    await repos.remove(repo.id);
    await results.hg.destroy();
    await results.processes.map((proc) => {
      return proc.kill();
    });
  });

  return results;
}
