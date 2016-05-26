import taskcluster from 'taskcluster-client';
import * as projectConfig from '../project_scopes';
import slugid from 'slugid';
import { duplicate as duplicateTask } from '../taskcluster/duplicate_task';
import { jobFromTask } from '../treeherder/job_handler';
import traverse from 'traverse';
import Project from 'mozilla-treeherder/project';
import { GraphDuplicator, GroupDuplicator } from '../taskcluster/duplicator';

import RetriggerExchange from '../exchanges/retrigger';
import Base from './base';
import Joi from 'joi';

// We use public only operations on the queue here...
const queue = new taskcluster.Queue();

function recursiveUpdateTaskIds(tasks, map) {
  return traverse.map(tasks, (value) => {
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
    let { taskId, runId, requester, project, revisionHash, revision } = job.data;
    console.log(`Handling retrigger for job ${taskId} in project '${project}'`);

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
    console.log("got taskGraphDetails", taskGraphDetails);

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
    let byTaskId = tasks.reduce(
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
      await queue.createTask(taskId, taskInfo.task);
    };
    for (let task of tasks) {
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
