import slugid from 'slugid';
import { Queue, QueueEvents } from 'taskcluster-client';
import Project from 'mozilla-treeherder/project';

let events = new QueueEvents();

const EVENT_MAP = {
  [events.taskDefined().exchange]: 'defined',
  [events.taskPending().exchange]: 'pending',
  [events.taskRunning().exchange]: 'running',
  [events.taskCompleted().exchange]: 'completed',
  [events.taskFailed().exchange]: 'failed',
  [events.taskException().exchange]: 'exception'
};

/** Convert Date object or JSON date-time string to UNIX timestamp */
function timestamp(date) {
  return Math.floor(new Date(date).getTime() / 1000);
};

function stateFromRun(run) {
  if (run.state === 'failed') {
    return 'completed';
  }
  if (run.state === 'exception') {
    return 'completed';
  }
  return run.state;
}

function resultFromRun(run) {
  if (run.state === 'completed') {
    return 'success';
  }
  if (run.state === 'failed') {
    return 'testfailed';
  }
  if (run.state === 'exception') {
    return 'exception';
  }
  return 'unknown';
}

class Handler {
  constructor(config, listener) {
    let credentials = JSON.parse(config.treeherder.credentials);

    this.queue = new Queue();
    this.prefix = config.treeherderTaskcluster.routePrefix;
    this.listener = listener;

    this.projects = Object.keys(credentials).reduce((result, key) => {
      let cred = credentials[key];
      result[key] = new Project(key, {
        consumerKey: cred.consumer_key,
        consumerSecret: cred.consumer_secret,
        baseUrl: config.treeherder.apiUrl
      });
      return result;
    }, {});

    listener.on('message', (message) => {
      return this.handle(message);
    });
  }

  async handle(message) {
    let { payload, exchange, routes } = message;

    let route = routes.find((route) => {
      return route.split('.')[0] === this.prefix;
    });

    if (!route) {
      throw new Error(`Unexpected message (no route) on ${exchange}`);
    }

    // The project and revision hash is encoded as part of the route...
    let [ , project, revisionHash ] = route.split('.');

    if (!this.projects[project]) {
      console.error('Unknown project', project);
      return;
    }

    if (!EVENT_MAP[exchange]) {
      console.error('Unknown state', exchange);
      return;
    }

    let task = await this.queue.getTask(payload.status.taskId);

    await this[EVENT_MAP[exchange]](
      this.projects[project],
      revisionHash,
      payload,
      task
    );
  }

  async defined(project, revisionHash, payload, task) {
    var status = payload.status;
    return await project.postJobs([{
      project:            project.project,
      revision_hash:      revisionHash,
      job: {
        job_guid:         slugid.decode(status.taskId) + '/' + 0,
        build_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        machine_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        name:             task.metadata.name,
        reason:           'scheduled',  // use reasonCreated or reasonResolved
        job_symbol:       task.extra.treeherder.symbol,
        group_name:       task.extra.treeherder.groupName,
        group_symbol:     task.extra.treeherder.groupSymbol,
        product_name:     task.extra.treeherder.productName,
        submit_timestamp: timestamp(task.created),
        start_timestamp:  undefined,
        end_timestamp:    undefined,
        state:            'pending',
        result:           'unknown',
        who:              task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    }]);
  }

  async pending(project, revisionHash, payload, task) {
    var status  = payload.status;
    await project.postJobs(status.runs.map(function(run) {
      var result = {
        project:            project.project,
        revision_hash:      revisionHash,
        job: {
          job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
          build_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          machine_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          name:             task.metadata.name,
          reason:           'scheduled',  // use reasonCreated or reasonResolved
          job_symbol:       task.extra.treeherder.symbol,
          group_name:       task.extra.treeherder.groupName,
          group_symbol:     task.extra.treeherder.groupSymbol,
          product_name:     task.extra.treeherder.productName,
          submit_timestamp: timestamp(run.scheduled),
          start_timestamp:  (run.started ? timestamp(run.started) : undefined),
          end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
          state:            stateFromRun(run),
          result:           resultFromRun(run),
          who:              task.metadata.owner,
          // You _must_ pass option collection until
          // https://github.com/mozilla/treeherder-service/issues/112
          option_collection: {
            opt:    true
          }
        }
      };
      // If this is the new run added, we include link to inspector
      if (payload.runId === run.runId) {
        // Add link to task-inspector
        var inspectorLink = "http://docs.taskcluster.net/tools/task-inspector/#" +
                            status.taskId + "/" + run.runId;
        result.job.artifacts = [{
          type:     'json',
          name:     "Job Info",
          blob: {
            job_details: [{
              url:            inspectorLink,
              value:          "Inspect Task",
              content_type:   "link",
              title:          "Inspect Task"
            }]
          }
        }];
      }
      return result;
    }));
  }

  async running(project, revisionHash, payload, task) {
    var status = payload.status;
    await project.postJobs(status.runs.map(function(run) {
      var result = {
        project:            project.project,
        revision_hash:      revisionHash,
        job: {
          job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
          build_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          machine_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          name:             task.metadata.name,
          reason:           'scheduled',  // use reasonCreated or reasonResolved
          job_symbol:       task.extra.treeherder.symbol,
          group_name:       task.extra.treeherder.groupName,
          group_symbol:     task.extra.treeherder.groupSymbol,
          product_name:     task.extra.treeherder.productName,
          submit_timestamp: timestamp(run.scheduled),
          start_timestamp:  (run.started ? timestamp(run.started) : undefined),
          end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
          state:            stateFromRun(run),
          result:           resultFromRun(run),
          who:              task.metadata.owner,
          // You _must_ pass option collection until
          // https://github.com/mozilla/treeherder-service/issues/112
          option_collection: {
            opt:    true
          }
        }
      };
      // If this is the run that started, we include logs
      if (payload.runId === run.runId) {

        // Add link to task-inspector, again, treeherder is obscure, it doesn't
        // pick it up the first time....
        var inspectorLink = "http://docs.taskcluster.net/tools/task-inspector/#" +
                            status.taskId + "/" + run.runId;
        result.job.artifacts = [{
          type:     'json',
          name:     "Job Info",
          blob: {
            job_details: [{
              url:            inspectorLink,
              value:          "Inspect Task",
              content_type:   "link",
              title:          "Inspect Task"
            }]
          }
        }];
      }
      return result;
    }));
  }

  async completed(project, revisionHash, payload, task) {
    var status  = payload.status;
    await project.postJobs(status.runs.map((run) => {
      var result = {
        project:            project.project,
        revision_hash:      revisionHash,
        job: {
          job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
          build_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          machine_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          name:             task.metadata.name,
          reason:           'scheduled',  // use reasonCreated or reasonResolved
          job_symbol:       task.extra.treeherder.symbol,
          group_name:       task.extra.treeherder.groupName,
          group_symbol:     task.extra.treeherder.groupSymbol,
          product_name:     task.extra.treeherder.productName,
          submit_timestamp: timestamp(run.scheduled),
          start_timestamp:  (run.started ? timestamp(run.started) : undefined),
          end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
          state:            stateFromRun(run),
          result:           resultFromRun(run),
          who:              task.metadata.owner,
          // You _must_ pass option collection until
          // https://github.com/mozilla/treeherder-service/issues/112
          option_collection: {
            opt:    true
          }
        }
      };

      // The log must only be set after the task is completed and the log must
      // also be gzipped.
      let url = this.queue.buildUrl(
        this.queue.getArtifact,
        status.taskId,
        run.runId,
        'public/logs/live_backing.log'
      );

      result.job.log_references = [{
        name: 'live_backing.log',
        url: url
      }];

      return result;
    }));
  }

  async failed(project, revisionHash, payload, task) {
    var status = payload.status;
    await project.postJobs(status.runs.map((run) => {
      var result = {
        project:            project.project,
        revision_hash:      revisionHash,
        job: {
          job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
          build_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          machine_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          name:             task.metadata.name,
          reason:           'scheduled',  // use reasonCreated or reasonResolved
          job_symbol:       task.extra.treeherder.symbol,
          group_name:       task.extra.treeherder.groupName,
          group_symbol:     task.extra.treeherder.groupSymbol,
          product_name:     task.extra.treeherder.productName,
          submit_timestamp: timestamp(run.scheduled),
          start_timestamp:  (run.started ? timestamp(run.started) : undefined),
          end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
          state:            stateFromRun(run),
          result:           resultFromRun(run),
          who:              task.metadata.owner,
          // You _must_ pass option collection until
          // https://github.com/mozilla/treeherder-service/issues/112
          option_collection: {
            opt:    true
          }
        }
      };

      // The log must only be set after the task is completed and the log must
      // also be gzipped.
      result.job.log_references = [{
        name:   'live_backing.log',
        url:    this.queue.buildUrl(
                  this.queue.getArtifact,
                  status.taskId,
                  run.runId,
                  'public/logs/live_backing.log'
                )
      }];

      return result;
    }));
  }

  async exception(project, revisionHash, payload, task) {
    var status = payload.status;
    await project.postJobs(status.runs.map((run) => {
      return {
        project:            project.project,
        revision_hash:      revisionHash,
        job: {
          job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
          build_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          machine_platform: {
              platform:     status.workerType,
              os_name:      '-',
              architecture: '-'
          },
          name:             task.metadata.name,
          reason:           'scheduled',  // use reasonCreated or reasonResolved
          job_symbol:       task.extra.treeherder.symbol,
          group_name:       task.extra.treeherder.groupName,
          group_symbol:     task.extra.treeherder.groupSymbol,
          product_name:     task.extra.treeherder.productName,
          submit_timestamp: timestamp(run.scheduled),
          start_timestamp:  (run.started ? timestamp(run.started) : undefined),
          end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
          state:            stateFromRun(run),
          result:           resultFromRun(run),
          who:              task.metadata.owner,
          // You _must_ pass option collection until
          // https://github.com/mozilla/treeherder-service/issues/112
          option_collection: {
            opt:    true
          }
        }
      };
    }));
  }
}

export default async function(prefix, listener) {
  let instance = new Handler(prefix, listener);
  await listener.resume();
}
