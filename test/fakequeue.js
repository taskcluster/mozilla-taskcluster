import _ from 'lodash';

export default class FakeQueue {
  constructor() {
    this.tasks = [];
    this.createdTasks = [];
  }

  /**
   * Add a task to the fake queue
   */
  addTask (taskId, body) {
    this.tasks.push(_.defaults(body, {taskId, dependencies: []}));
  }

  async task (taskId) {
    let task = _.find(this.tasks, {taskId});
    if (task) {
      return _.omit(task, ['taskId']);
    } else {
      throw new Error("no such task sorry");
    }
  }

  async createTask (taskId, taskDef) {
    this.createdTasks.push({taskId, taskDef});
  }

  async listDependentTasks (taskId, options) {
    // this only returns up to two dependent
    // tasks, to test the continuationToken handling
    let offset = 0;
    if (options && options.hasOwnProperty('continuationToken')) {
      offset = JSON.parse(options.continuationToken);
    }

    let depTasks = _.filter(this.tasks,
        t => t.dependencies.indexOf(taskId) !== -1);

    // convert to a semblance of the return value from listDependentTasks
    depTasks = _.map(depTasks, (t) => { return {status: {taskId: t.taskId}, task: {}}; });

    // slice down given the offset
    depTasks = _.slice(depTasks, offset, offset + 2);

    let result = {
      taskId,
      tasks: depTasks,
    }
    if (depTasks.length) {
      result.continuationToken = JSON.stringify(offset + 2);
    }
    return result;
  }
}
