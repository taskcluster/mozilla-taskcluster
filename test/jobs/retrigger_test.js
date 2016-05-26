import assert from 'assert';
import _ from 'lodash';
import slugid from 'slugid';
import RetriggerJob from '../../build/jobs/retrigger';
import FakeQueue from '../fakequeue';

suite('jobs/retrigger', function() {
  suite('RetriggerJob', function() {
    var fakeQueue, job;

    setup(function() {
      job = new RetriggerJob({config: {}, runtime: {}, publisher: {}});
      fakeQueue = new FakeQueue();
    });

    suite('duplicateTaskInTaskGroup', function() {
      test("duplicating a subgraph generates the right calls to queue.createTask", async function() {
        fakeQueue.addTask('build', {payload: 'build', dependencies: ['other1'], taskGroupId: 'tgid'});
        fakeQueue.addTask('test1', {payload: 'test1', dependencies: ['build', 'other2']});
        fakeQueue.addTask('test2', {payload: 'test2', dependencies: ['build', 'test1']});
        fakeQueue.addTask('sign', {payload: 'sign', dependencies: ['test1', 'test2', 'other3']});
        let res = await job.duplicateTaskInTaskGroup('try', fakeQueue, 'build');
        assert.equal(res, 'tgid');
        let newTaskIds = _.reduce(fakeQueue.createdTasks, (result, create) => {
          result[create.taskDef.payload] = create.taskId;
          return result;
        }, {});
        _.forEach(fakeQueue.createdTasks, create => create.taskDef.dependencies.sort());
        assert.deepEqual(fakeQueue.createdTasks, [
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

