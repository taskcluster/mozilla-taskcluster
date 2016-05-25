import assert from 'assert';
import _ from 'lodash';
import slugid from 'slugid';
import RetriggerJob from '../../build/jobs/retrigger';

suite('jobs/retrigger', function() {
  suite('RetriggerJob', function() {
    var createdTasks, tasks, job;

    let addTask = (taskId, body) => {
      tasks.push(_.defaults(body, {taskId, dependencies: []}));
    };

    let fakeQueue = {};
    fakeQueue.task = async (taskId) => {
      let task = _.find(tasks, {taskId});
      if (task) {
        return _.omit(task, ['taskId']);
      } else {
        throw new Error("no such task sorry");
      }
    };

    // listDependentTasks only returns up to two dependent
    // tasks, to test the continuationToken handling
    fakeQueue.listDependentTasks = async (taskId, options) => {
      let offset = 0;
      if (options && options.continuationToken) {
        offset = JSON.parse(options.continuationToken);
      }

      let depTasks = _.filter(tasks,
          t => t.dependencies.indexOf(taskId) !== -1);

      // convert to a semblance of the return value from listDependentTasks
      depTasks = _.map(depTasks, (t) => { return {status: {taskId: t.taskId}, task: {}}; });

      // slice down given the offset
      depTasks = _.slice(depTasks, offset, offset + 2);

      return {
        taskId,
        tasks: depTasks,
        continuationToken: depTasks.length ? JSON.stringify(offset + 2) : undefined,
      }
    };

    fakeQueue.createTask = async (taskId, taskDef) => {
      createdTasks.push({taskId, taskDef});
    };

    setup(function() {
      job = new RetriggerJob({config: {}, runtime: {}, publisher: {}});
      tasks = [];
      createdTasks = [];
    });

    suite('duplicateTaskInTaskGroup', function() {
      test("duplicating a subgraph generates the right calls to queue.createTask", async function() {
        addTask('build', {payload: 'build', dependencies: ['other1'], taskGroupId: 'tgid'});
        addTask('test1', {payload: 'test1', dependencies: ['build', 'other2']});
        addTask('test2', {payload: 'test2', dependencies: ['build', 'test1']});
        addTask('sign', {payload: 'sign', dependencies: ['test1', 'test2', 'other3']});
        let res = await job.duplicateTaskInTaskGroup('try', fakeQueue, 'build');
        assert.equal(res, 'tgid');
        let newTaskIds = _.reduce(createdTasks, (result, create) => {
          result[create.taskDef.payload] = create.taskId;
          return result;
        }, {});
        _.forEach(createdTasks, create => create.taskDef.dependencies.sort());
        assert.deepEqual(createdTasks, [
          {
            "taskDef": {
              "dependencies": ["other1"].sort(),
              "payload": "build",
              "taskGroupId": "tgid"
            },
            "taskId": newTaskIds['build']
          },
          {
            "taskDef": {
              "dependencies": ["other2", newTaskIds['build']].sort(),
              "payload": "test1"
            },
            "taskId": newTaskIds['test1']
          },
          {
            "taskDef": {
              "dependencies": [newTaskIds['build'], newTaskIds['test1']].sort(),
              "payload": "test2"
            },
            "taskId": newTaskIds['test2']
          },
          {
            "taskDef": {
              "dependencies": [
                "other3",
                newTaskIds['test1'],
                newTaskIds['test2']
              ].sort(),
              "payload": "sign"
            },
            "taskId": newTaskIds['sign']
          }
        ]);
      });
    });
  });
});

