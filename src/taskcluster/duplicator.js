import _ from 'lodash';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';
import { duplicate as duplicateTask } from './duplicate_task';
import Project from 'mozilla-treeherder/project';

// We use public only operations on the queue here...
const queue = new taskcluster.Queue();

/**
 * Duplicate task-graph nodes (old scheduler), following dependencies in reverse
 * to duplicate all tasks depending on the given node as well.
 */
export class GraphDuplicator {
  constructor(scheduler) {
    this.scheduler = scheduler;
  }

  /**
   * Duplicate the task indicated by taskId, including dependencies if
   * `dependencies` is true.
   *
   * NOTE: this does not maintain dependencies on tasks outside of the
   * duplicated subgraph.
   *
   * *output* nodes: pass an empty object as the first parameter; on return
   * this will contain the duplicated task subgraph, keyed by old taskId.  Each
   * value has {taskId: <new taskId>, requires: [<dependencies>], task: <task
   * definition>}.  Task definitions have their task groups stripped and datestamps
   * updated.
   *
   * returns: values of the nodes parameter, in arbitrary order
   */
  async duplicateGraphNode(nodes, graphId, taskId, dependencies = false, parent = null) {
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

    // Task group id should never be duplicated... The scheduler can assign a new
    // one once the graph is created...
    delete node.task.taskGroupId;

    // New task should not have any dependencies...
    delete node.task.dependencies;
    delete node.task.requires;

    // Add the parent node if available...
    if (parent) node.requires.push(parent);
    // Add dependencies if explicitly desired.
    if (dependencies && graphNode.dependents) {
      // Read though the dependencies and add them to the graph...
      await Promise.all(graphNode.dependents.map(async (childTaskId) => {
        await this.duplicateGraphNode(nodes, graphId, childTaskId, true, newTaskId);
      }));
    }

    return Object.keys(nodes).reduce((result, value) => {
      result.push(nodes[value]);
      return result;
    }, []);
  }
}

/**
 * Duplicate a task in a task group (big-graph scheduler), following reverse dependencies
 * to duplicate all tasks that depend on this one as well.
 */
export class GroupDuplicator {
  constructor(queue) {
    this.queue = queue;
  }

  /**
   * Duplicate the task indicated by taskId, including dependencies if
   * `dependencies` is true.
   *
   * *output* nodes: pass an empty object as the first parameter; on return
   * this will contain the duplicated task subgraph, keyed by old taskId.  Each
   * value has {taskId: <new taskId>, task: <task definition>}.  Task dependencies
   * are included within the task definitions.  Task definitions have their datestamps
   * updated.
   *
   * returns: values of the nodes parameter, in arbitrary order
   */
  async duplicateGroupNode(nodes, taskId, dependencies = false, oldParent = null, parent = null) {
    // If the node has already been duplicated skip...
    if (nodes[taskId]) {
      // replace the old parent 
      if (parent) {
        this.replaceDependency(nodes[taskId].task, oldParent, parent);
      }
      return;
    };

    let newTaskId = slugid.nice();
    let node = nodes[taskId] = {
      taskId: newTaskId,
      requires: []
    }

    // Fetch all details related to the task id...
    let task = await this.queue.task(taskId);
    node.task = duplicateTask(task);
    if (parent) {
      this.replaceDependency(node.task, oldParent, parent);
    }

    // Add the parent node if available...
    if (parent) node.requires.push(parent);
    // Add dependencies if explicitly desired.
    if (dependencies) {
      let continuationToken;
      do {
        let res = await this.queue.listDependentTasks(taskId, continuationToken? {continuationToken} : {});
        continuationToken = res.continuationToken;
        // Read though the dependencies and add them to the graph, sequentially to
        // avoid pounding the queue API with many concurrent requests
        for (let {status} of res.tasks) {
          await this.duplicateGroupNode(nodes, status.taskId, true, taskId, newTaskId);
        }
      } while (continuationToken);

    }

    return Object.keys(nodes).reduce((result, value) => {
      result.push(nodes[value]);
      return result;
    }, []);
  }

  replaceDependency(task, oldTaskId, newTaskId) {
    _.remove(task.dependencies, tid => tid === oldTaskId);
    task.dependencies.push(newTaskId);
  }
}


