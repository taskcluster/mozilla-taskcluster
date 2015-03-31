import taskcluster from 'taskcluster-client';
import kue from 'kue';
import slugid from 'slugid';
import denodeify from 'denodeify';

const JOB_RETRY_DELAY = 1000 * 10;
const JOB_ATTEMPTS = 20;

const SCHEDULER_TYPE = 'task-graph-scheduler';

async function scheduleAction(jobs, type, body) {
  let msg = jobs.create(type, body).
    attempts(JOB_ATTEMPTS).
    searchKeys(['taskId']).
    backoff({ type: 'exponential', delay: JOB_RETRY_DELAY });

  await denodeify(msg.save.bind(msg))();
}

class Handler {
  constructor(config, listener) {
    this.listener = listener;
    this.queue = new taskcluster.Queue(config.taskcluster);

    this.jobs = kue.createQueue({
      prefix: config.kue.prefix,
      redis: config.redis
    });

    listener.on('message', (message) => {
      return this.handleAction(message);
    });
  }


  async handleCancel(taskId, runId, task, payload) {
    // We may want to put this in "kue" but this is probably fine.
    await this.queue.cancelTask(taskId);
  }

  async handleRetrigger(taskId, runId, task, payload) {
    if (
      // Must be a scheduled task...
      task.schedulerId === SCHEDULER_TYPE &&
      // Must have a task group id...
      task.taskGroupId
    ) {
      // TODO: This would also be a good place to validate the scopes of how
      // this is set...
      await scheduleAction(this.jobs, 'retrigger', {
        taskId,
        runId,
        title: `Retrigger for ${taskId} for project ${payload.project} (${payload.requester})`,
        project: payload.project,
        requester: payload.requester
      });
    }
  }

  async handleAction(message) {
    let { payload, exchange, routes } = message;
    // We encode the task id/run into the job guid so extract the task id.
    let [taskId, runId] = payload.job_guid.split('/')
    taskId = slugid.encode(taskId);
    let task = await this.queue.task(taskId);

    switch (payload.action) {
      case 'cancel':
        await this.handleCancel(taskId, runId, task, payload);
        break;
      case 'retrigger':
        await this.handleRetrigger(taskId, runId, task, payload);
        break;
      default:
        console.log(`[action handler] unknown action ${payload.action}`);
    }
  }
}

export default async function(config, listener) {
  let instance = new Handler(config, listener);
  await listener.resume();
}
