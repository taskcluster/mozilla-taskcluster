import taskcluster from 'taskcluster-client';
import * as projectConfig from '../project_scopes';
import slugid from 'slugid';
import { duplicate as duplicateTask } from '../taskcluster/duplicate_task';
import traverse from 'traverse';
import Project from 'mozilla-treeherder/project';
import { GraphDuplicator, GroupDuplicator } from '../taskcluster/duplicator';

import RetriggerExchange from '../exchanges/retrigger';
import Base from './base';
import Joi from 'joi';

// We use public only operations on the queue here...
const queue = new taskcluster.Queue();

// Schema for the task.extra.treeherder field.
const SCHEMA = Joi.object().keys({
  // Maps directly to `build_platform`
  build: Joi.object().keys({
    platform: Joi.string().required().
      description('Treeherder platform name'),
    os_name: Joi.string().default('-').
      description('Operating system name for build (linux)'),
    architecture: Joi.string().default('-').
      description('Operating system architecture (x64, etc..)')
  }).required().rename('os', 'os_name'),

  machine: Joi.object().keys({
    platform: Joi.string().required(),
    os_name: Joi.string().default('-'),
    architecture: Joi.string().default('-')
  }).required().rename('os', 'os_name'),

  machineId: Joi.string().
    description('Machine ID that executed the task run'),

  symbol: Joi.string().required().
    description('Treeherder job symbol'),
  groupName: Joi.string().
    description('Treeherder group name (seen when hovering over group symbol)').
    default('unknown'),
  groupSymbol: Joi.string().
    description('Treeherder group symbol').
    // If the default is not set to ? 'unknown' is used in the UI which will
    // trigger that to be displayed when ? is used no extra UI is present.
    default('?'),
  tier: Joi.number().
    description('Treeherder tier').
    default(1),
  productName: Joi.string().
    description('TODO: Figure out what this is for'),

  collection: Joi.object().unknown(true).keys({
    opt: Joi.boolean(),
    debug: Joi.boolean(),
    pgo: Joi.boolean(),
    cc: Joi.boolean(),
    asan: Joi.boolean(),
    tsan: Joi.boolean(),
    addon: Joi.boolean(),
  }),

  revision_hash: Joi.string().allow('').
    description('Calculated revision hash when result set was created'),

  revision: Joi.string().allow('').
    description('Top level revision for the push'),

  jobKind: Joi.string().allow('').
    description('Kind of job (build, test, other)')
});

/** Convert Date object or JSON date-time string to UNIX timestamp */
function timestamp(date) {
  return Math.floor(new Date(date).getTime() / 1000);
};

function jobFromTask(taskId, task, run) {
  // Create the default set of options...
  let treeherder = (task.extra && task.extra.treeherder) || {};
  treeherder = _.merge(
    {
      build: {
        platform: task.workerType
      },
      machine: {
        platform: task.workerType
      },
      machineId: run.workerId,
      revision_hash: "",
      revision: ""
    },
    treeherder
  );

  // Here primarily for backwards compatibility so we don't need to require
  // tasks to define collection
  if (!treeherder.collection) {
    treeherder.collection = { opt: true };
  }

  // Chunks are often numbers type cast here so we don't need to enforce
  // this everywhere...
  if (typeof treeherder.symbol === 'number') {
    treeherder.symbol = String(treeherder.symbol);
  }

  // Validation is useful primarily for use with kue viewer as you can easily
  // see what failed during the validation.
  let validate = Joi.validate(treeherder, SCHEMA);
  if (validate.error) {
    throw new Error(validate.error.annotate());
  }

  let config = validate.value;
  let job = {
    job_guid: `${slugid.decode(taskId)}/${run.runId}`,
    build_system_type: 'taskcluster',
    build_platform: config.build,
    machine_platform: config.machine,
    machine: config.machineId,
    // Maximum job name length is 100 chars...
    name: task.metadata.name.slice(0, 99),
    reason: 'scheduled',  // use reasonCreated or reasonResolved
    job_symbol: config.symbol,
    submit_timestamp: timestamp(task.created),
    start_timestamp: (run.started ? timestamp(run.started) : undefined),
    end_timestamp: (run.resolved ? timestamp(run.resolved) : undefined),
    who: task.metadata.owner,
    option_collection: config.collection
  };

  // Optional configuration details if these keys are present it has an effect
  // on the job results so they are conditionally added to the object.
  if (config.groupName) job.group_name = config.groupName;
  if (config.groupSymbol) job.group_symbol = config.groupSymbol;
  if (config.productName) job.product_name = config.productName;
  if (config.tier) job.tier = config.tier;

  // Add link to task-inspector
  let inspectorLink = 'https://tools.taskcluster.net/task-inspector/#' +
                      taskId + '/' + run.runId;

  // TODO: Consider removing this in favor of something else...
  job.artifacts = [{
    type:     'json',
    name:     'Job Info',
    blob: {
      job_details: [{
        url:            inspectorLink,
        value:          'Inspect Task',
        content_type:   'link',
        title:          'Inspect Task'
      }]
    }
  }];

  return job;
}

export function recursiveUpdateTaskIds(tasks, map) {
  return traverse.map(tasks, function (value) {
    // Do not attempt to change old task Ids
    if (this.key === 'oldTaskId') return value;
    // Only operate on values that are strings;
    if (typeof value !== 'string') return value;
    // XXX: This is slow and somewhat terrible but reliable... The task ids may
    // appear anywhere in the graph (though it may not be super useful to do
    // so).
    Object.keys(map).forEach((oldTaskId) => {
      let newTaskId = map[oldTaskId];
      // .replace does not replace all matches so iterate through all matches.
      while (value.indexOf(oldTaskId) !== -1) {
        value = value.replace(oldTaskId, newTaskId);
      }
    });
    return value;
  });
}

export default class RetriggerJob extends Base {
  get configSchema() {
    return {
      publisher: Joi.object().required()
    }
  }

  async work(job) {
    let { eventId, taskId, runId, requester, project, revisionHash, revision } = job.data;
    console.log(`Handling retrigger event ${eventId} for ` +
                `task ${taskId} in project '${project}' (${requester})`);

    let task = await queue.task(taskId);
    let { status } = await queue.status(taskId);
    let run = status.runs[runId];
    let taskGraphId = task.taskGroupId;

    // Ensure when retrigger is sent that we use the right scopes for the job.
    let scopes = projectConfig.scopes(this.config.try, project, false);
    let scheduler = new taskcluster.Scheduler({
      credentials: this.config.taskcluster.credentials,
      // include scheduler:create-task-graph so we can call create-task-graph,
      // but not include it in graph.scopes
      authorizedScopes: scopes.concat(['scheduler:create-task-graph'])
    });

    let taskGraphDetails;
    try {
      // Get the status of the task graph if it exists.  If an error is thrown,
      // it is assuemd to be a task group.
      taskGraphDetails = await scheduler.inspect(taskGraphId);
    } catch(e) {
      console.log(
        `Could not find graph information for ${taskGraphId} while retriggering. ` +
        `Assuming to be a task group instead.`
      );
    }

    let newGraphId;
    try {
      if (taskGraphDetails) {
        newGraphId = await this.duplicateTaskInTaskGraph(project,
                                                         scheduler,
                                                         taskGraphId,
                                                         taskId,
                                                         taskGraphDetails,
                                                         scopes);
      } else {
        let queue = new taskcluster.Queue({
          credentials: this.config.taskcluster.credentials,
          authorizedScopes: scopes
        });
        newGraphId = await this.duplicateTaskInTaskGroup(project, queue, taskId)
      }
    } catch(e) {
      console.log(`Error posting retrigger job for '${project}', ${JSON.stringify(e, null, 2)}`);
      await this.postRetriggerFailureJob(project, revision, revisionHash, task, e);
      return;
    }

    let message = {
      requester,
      taskGroupId: newGraphId
    };

    let routingKeys = {
      taskId: taskId
    };

    await this.publisher.publish(
      RetriggerExchange, routingKeys, message
    );
    console.log(`Finished handling retrigger event ${eventId} for ` +
                `task ${taskId} in project '${project}' (${requester})`);
  }

  async duplicateTaskInTaskGraph(project, scheduler, graphId, taskId, taskGraphDetails, scopes) {
    let graphDuplicator = new GraphDuplicator(scheduler);
    // Duplicate the graph tasks...
    let taskNodes = {};
    let tasks = await graphDuplicator.duplicateGraphNode(
      taskNodes,
      graphId,
      taskId,
      true // Always duplicate entire graph
    );

    // Build a map of old task ids to new task ids...
    let taskMap = Object.keys(taskNodes).reduce((result, value) => {
      result[value] = taskNodes[value].taskId;
      return result;
    }, {});

    // Replace all instances of the old task id's with the new ones...
    let transformedTasks = recursiveUpdateTaskIds(tasks, taskMap);

    let newGraphId = slugid.nice();
    let graph = {
      scopes: scopes,
      tags: taskGraphDetails.tags,
      metadata: taskGraphDetails.metadata,
      tasks: transformedTasks
    };

    console.log(
        `Posting retrigger job for '${project}' with task graph id ${newGraphId}`
    );

    await scheduler.createTaskGraph(newGraphId, graph);
    return newGraphId;
  }

  async duplicateTaskInTaskGroup(project, queue, taskId) {
    let groupDuplicator = new GroupDuplicator(queue);
    let taskNodes = {};
    let tasks = await groupDuplicator.duplicateGroupNode(
      taskNodes,
      taskId,
      true // Always duplicate entire graph
    );

    // Build a map of old task ids to new task ids...
    let taskMap = Object.keys(taskNodes).reduce((result, oldTaskId) => {
      taskNodes[oldTaskId].oldTaskId = oldTaskId;
      result[oldTaskId] = taskNodes[oldTaskId].taskId;
      return result;
    }, {});

    // Replace all instances of the old task id's with the new ones...
    let transformedTasks = recursiveUpdateTaskIds(tasks, taskMap);

    // Now create the new tasks.  This must proceed in post-order, with dependent
    // tasks following those they depend on.
    let added = new Set();
    let byTaskId = transformedTasks.reduce(
        (result, taskInfo) => { result[taskInfo.taskId] = taskInfo; return result; },
        {});
    let add = async (taskId) => {
      if (added.has(taskId))
        return;
      added.add(taskId);

      let taskInfo = byTaskId[taskId];
      // some task dependencies are not in the duplicated subgraph, and that's OK
      if (!taskInfo)
        return;

      for (let dep of taskInfo.task.dependencies) {
        await add(dep);
      }
      console.log(
          `Posting retrigger job for '${project}' ` +
          `with task id ${taskId} replacing ${taskInfo.oldTaskId}`
      );

      // update created to the current time, since queue requires this to be
      // approximately "now".  The task duplication process took care of updating
      // all of the other timestamps.
      taskInfo.task.created = (new Date()).toJson();

      await queue.createTask(taskId, taskInfo.task);
    };

    console.log(`Posting ${transformedTasks.length} tasks to retrigger ${taskId}`);
    for (let task of transformedTasks) {
      await add(task.taskId);
    }

    // the taskGroupId hasn't changed, so just return the original task's taskGroupId
    return taskNodes[taskId].task.taskGroupId;
  }

  async postRetriggerFailureJob(projectName, revision, revisionHash, task, error) {
      let project = new Project(projectName, {
        clientId: this.config.treeherder.credentials.clientId,
        secret: this.config.treeherder.credentials.secret,
        baseUrl: this.config.treeherder.apiUrl,
        // Issue up to 2 retries for 429 throttle issues.
        throttleRetries: 2
      });

      let push = {}
      let job = jobFromTask(slugid.nice(), task, {runId: 0, workerId: 'unknown'})
      job.submit_timestamp = Math.floor(new Date().getTime() / 1000);
      job.result = 'exception';
      job.state = 'completed';

      job.artifacts = [
          {
            "type": "json",
            "name": "text_log_summary",
            "job_guid": job.job_guid,
            "blob": {
              "step_data": {
                "all_errors": [ `[taskcluster:error] Unable to retrigger task. ${error}`],
                "steps": []
              },
              "logname":"error_log",
              "parse_status": "parsed"
            }
          },
          {
            "type": "json",
            "name": "Bug suggestions",
            "job_guid": job.job_guid,
            "blob": [
                {
                    "search": `[taskcluster:error] Unable to retrigger task. ${error}`,
                    "search_terms": [
                    ],
                    "bugs": {
                        "open_recent": [],
                        "all_others": []
                    }
                },
            ],
        }
      ];

      push = {
        project: projectName,
        revision_hash: revisionHash,
        revision: revision,
        job: job
      };

      try {
        let res = await project.postJobs([push]);
      } catch (err) {
        console.log(`Error pushing retrigger failure status to treeherder. ${err}`)
        // Just return and let the caller handle any exceptions to raise.
        // This should be a best effort attempt.
        return;
      }
  }
}
