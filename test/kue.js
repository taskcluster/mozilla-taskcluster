import denodeify from 'denodeify';
import waitFor from './wait_for';

export async function clear(runtime) {
  let Jobs = runtime.kue.Job;
  let jobs = runtime.jobs;

  let completed = await denodeify(jobs.complete).call(jobs);
  let failed = await denodeify(jobs.failed).call(jobs);
  let active = await denodeify(jobs.active).call(jobs);
  let delayed = await denodeify(jobs.delayed).call(jobs);
  let remove = denodeify(Jobs.remove.bind(Jobs));

  // Note we don't really care about errors in this case as there are race
  // conditions between when the workers complete tasks and when we attempt to
  // clear them.
  let list = completed.concat(failed).concat(active).concat(delayed);
  await Promise.all(list.map((id) => {
    return remove(id);
  })).catch(() => {});
}

export async function stats(runtime) {
  let jobs = runtime.jobs;
  let complete = await denodeify(jobs.completeCount).call(jobs);
  let incomplete = await denodeify(jobs.inactiveCount).call(jobs);
  let active = await denodeify(jobs.activeCount).call(jobs);

  return { complete, incomplete, active };
}

export async function ensureFinished(runtime, count=1) {
  await waitFor(async function() {
    let details = await stats(runtime);

    return details.complete === count &&
           details.incomplete === 0 &&
           details.active === 0;
  }.bind(this));
}
