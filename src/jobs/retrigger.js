import taskcluster from 'taskcluster-client';
import * as projectConfig from '../project_scopes';
import slugid from 'slugid';
import { duplicate as duplicateTask } from '../taskcluster/duplicate_task';
import { jobFromTask } from '../treeherder/job_handler';
import traverse from 'traverse';
import Project from 'mozilla-treeherder/project';

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

class GraphDuplicator {
  constructor(scheduler) {
    this.scheduler = scheduler;
  }

  async duplicateNode(nodes, graphId, taskId, dependencies = false, parent = null) {
    // If the node has already been duplicated skip...
    if (nodes[taskId]) {
      // Add the parent node if available...
      if (parent) nodes[taskId].requires.push(parent);
      return;
    };

    let newTaskId = slugid.nice();
    let node = nodes[taskId] = {
      taskId: newTaskId,
      requires: []
    }

    // Fetch all details related to the task id...
    let [task, graphNode] = await Promise.all([
      queue.task(taskId),
      this.scheduler.inspectTask(graphId, taskId)
    ]);

    node.reruns = graphNode.reruns;
    node.task = duplicateTask(task);

    // Add the parent node if available...
    if (parent) node.requires.push(parent);
    // Add dependencies if explicitly desired.
    if (dependencies && graphNode.dependents) {
      // Read though the dependencies and add them to the graph...
      await Promise.all(graphNode.dependents.map(async (childTaskId) => {
        await this.duplicateNode(nodes, graphId, childTaskId, true, newTaskId);
      }));
    }

    return Object.keys(nodes).reduce((result, value) => {
      result.push(nodes[value]);
      return result;
    }, []);
  }
}

export default class RetriggerJob extends Base {
  get configSchema() {
    return {
      publisher: Joi.object().required()
    }
  }

  async work(job) {
    let { taskId, runId, requester, project, revisionHash } = job.data;
    let task = await queue.task(taskId);

    console.log(`Handling retrigger for job ${taskId} in project '${project}'`);
    // Ensure when retrigger is sent that we use the right scopes for the job.
    let scopes = projectConfig.scopes(this.config.try, project, false);
    let scheduler = new taskcluster.Scheduler({
      credentials: this.config.taskcluster.credentials,
      // include scheduler:create-task-graph so we can call create-task-graph,
      // but not include it in graph.scopes
      authorizedScopes: scopes.concat(['scheduler:create-task-graph'])
    });
    let graphDuplicator = new GraphDuplicator(scheduler);

    let taskGraphId = task.taskGroupId;
    let { status } = await queue.status(taskId);
    let run = status.runs[runId];

    // Duplicate the graph tasks...
    let taskNodes = {};
    let tasks = await graphDuplicator.duplicateNode(
      taskNodes,
      taskGraphId,
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

    let taskGraphDetails = await scheduler.inspect(taskGraphId);
    let newGraphId = slugid.nice();
    let graph = {
      scopes: scopes,
      tags: taskGraphDetails.tags,
      metadata: taskGraphDetails.metadata,
      tasks: transformedTasks
    };

    console.log(
        `Posting retrigger job for '${project}' with id ${newGraphId}`
    );
    try {
      await scheduler.createTaskGraph(newGraphId, graph);
    } catch (e) {
      console.log(`Error posting retrigger job for '${project}', ${JSON.stringify(e, null, 2)}`);
      await this.postRetriggerFailureJob(project, revisionHash, task, e);
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

  async postRetriggerFailureJob(projectName, revisionHash, task, error) {
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
