import _ from 'lodash';
import taskcluster from 'taskcluster-client';
import kue from 'kue';
import slugid from 'slugid';
import denodeify from 'denodeify';
import parseRoute from '../util/route_parser';

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
    this.prefix = config.treeherderTaskcluster.routePrefix;

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
    let route = task.routes.find((route) => {
      return route.split('.')[0] === this.prefix;
    });

    if (!route) {
      throw new Error(`Unexpected message (no route) on ${exchange}`);
    }

    let parsedRoute = parseRoute(route);

    if (!parsedRoute.revision && !parsedRoute.revisionHash) {
      console.log(`Could not determine revision hash while retriggering task ${taskId}.  Not retriggering.`);
      return;
    }

    // During a transition period, some tasks might contain a revision within
    // the task definition that should override the revision in the routing key.
    let revision = _.get(task, 'extra.treeherder.revision');

    if (revision) {
      parsedRoute.revision = revision;
    }

    // TODO: This would also be a good place to validate the scopes of how
    // this is set.
    await scheduleAction(this.jobs, 'retrigger', {
      eventId: slugid.v4(),
      taskId,
      runId,
      title: `Retrigger for ${taskId} for project ${payload.project} (${payload.requester})`,
      project: payload.project,
      requester: payload.requester,
      revisionHash: parsedRoute.revisionHash,
      revision: parsedRoute.revision
    });
  }

  async handleAction(message) {
    let { payload, exchange, routes } = message;
    // We encode the task id/run into the job guid so extract the task id.
    let [taskId, runId] = payload.job_guid.split('/')
    taskId = slugid.encode(taskId);
    console.log(`Received ${payload.action} event for task ${taskId} by ${payload.requester}`);
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
