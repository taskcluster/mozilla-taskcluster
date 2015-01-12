import pushlog from './pushlog';
import collectionSetup from './collection';
import createProc from './process';

export default function setup(...processes) {
  collectionSetup();

  let results = {
    alias: 'try',
    pushlog: null,
    processes: []
  };

  let url;
  suiteSetup(async function() {
    results.pushlog = await pushlog();
    results.url = results.pushlog.url;
  });

  let repos, monitor, pushworker;
  suiteSetup(async function() {
    repos = this.runtime.repositories;
    await repos.create({
      url: results.url,
      alias: results.alias
    });

    processes = ['pushlog_monitor.js'].concat(processes);
    results.processes = await Promise.all(processes.map((path) => {
      let r = createProc(path);
      return r;
    }));
  });

  suiteTeardown(async function() {
    await results.pushlog.stop();
    await results.processes.map((proc) => {
      return proc.kill();
    });
  });

  return results;
}
