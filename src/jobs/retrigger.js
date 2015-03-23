import taskcluster from 'taskcluster-client';
import * as projectConfig from '../project_scopes';
import slugid from 'slugid';
import { duplicate as duplicateTask } from '../taskcluster/duplicate_task';
import traverse from 'traverse';

import RetriggerExchange from '../exchanges/retrigger';
import Base from './base';
import Joi from 'joi';

// If the run retriggered is in one of these states we duplicate it and all of
// it's dependencies...
const FULL_GRAPH_STATES = new Set([
  'failed',
  'exception'
]);

// We use public only operations on the queue here...
const queue = new taskcluster.Queue();

function replaceAllInstances(tasks, map) {
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

    let newTaskId = slugid.v4();
    let node = nodes[taskId] = {
      taskId: newTaskId,
      requires: []
    }

    // Fetch all details related to the task id...
    let [task, graphNode] = await Promise.all([
      queue.getTask(taskId),
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
    let { taskId, runId, requester, project } = job.data;
    let task = await queue.getTask(taskId);

    job.log(`Posting retrigger for job ${taskId} in project ${project}`);
    // Ensure when retrigger is sent that we use the right scopes for the job.
    let scopes = projectConfig.scopes(this.config.try, project);
    let scheduler = new taskcluster.Scheduler({
      credentials: this.config.taskcluster.credentials,
      authorizedScopes: scopes
    });
    let graphDuplicator = new GraphDuplicator(scheduler);

    let taskGraphId = task.taskGroupId;
    let { status } = await queue.status(taskId);
    let run = status.runs[runId];
    let duplicateEntireGraph = FULL_GRAPH_STATES.has(run.state);

    // Duplicate the graph tasks...
    let taskNodes = {};
    let tasks = await graphDuplicator.duplicateNode(
      taskNodes,
      taskGraphId,
      taskId,
      duplicateEntireGraph
    );

    // Build a map of old task ids to new task ids...
    let taskMap = Object.keys(taskNodes).reduce((result, value) => {
      result[value] = taskNodes[value].taskId;
      return result;
    }, {});

    // Replace all instances of the old task id's with the new ones...
    let transformedTasks = replaceAllInstances(tasks, taskMap);

    let taskGraphDetails = await scheduler.inspect(taskGraphId);
    let newGraphId = slugid.v4();
    let graph = {
      scopes: scopes,
      tags: taskGraphDetails.tags,
      metadata: taskGraphDetails.metadata,
      tasks: transformedTasks
    };

    job.log(`Task graph id ${newGraphId}`);
    await scheduler.createTaskGraph(newGraphId, graph);

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
}


