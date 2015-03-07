import slugid from 'slugid';
import merge from 'lodash.merge'

export default class {
  constructor(scheduler) {
    this.scheduler = scheduler;
  }

  async createTaskGraph(overrides = {}) {
    let taskId = slugid.v4();
    let taskGraphId = slugid.v4();

    let graph = merge({
      metadata: {
        name:         'Example Task name',
        description:  'Markdown description of **what** this task does',
        owner:        'user@example.com',
        source:       'http://docs.taskcluster.net/tools/task-creator/'
      },
      scopes: [
        'queue:define-task:test/test',
        'queue:route:tc-treeherder-test.*'
      ],
      tasks: [{
        taskId,
        task: {
          provisionerId:  'test',
          schedulerId:    'task-graph-scheduler',
          workerType:     'test',
          created:        new Date().toJSON(),
          deadline:       new Date(new Date().getTime() + 60 * 60 * 5).toJSON(),
          routes: [],
          payload: {},
          metadata: {
            name:         'Example Task name',
            description:  'Markdown description of **what** this task does',
            owner:        'user@example.com',
            source:       'http://docs.taskcluster.net/tools/task-creator/'
          },
          extra: {
            treeherder: {
              symbol:         'S'
            }
          }
        }
      }]
    }, overrides);
    await this.scheduler.createTaskGraph(taskGraphId, graph);
    return [taskGraphId, taskId, graph]
  }
}
