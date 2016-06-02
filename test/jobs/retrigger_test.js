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
        fakeQueue.addTask('buildId', {payload: 'build', dependencies: ['other1Id'], taskGroupId: 'tgid'});
        fakeQueue.addTask('test1Id', {payload: 'test1', dependencies: ['buildId', 'other2Id']});
        fakeQueue.addTask('test2Id', {payload: 'test2', dependencies: ['buildId', 'test1Id']});
        fakeQueue.addTask('signId', {payload: 'sign', dependencies: ['test1Id', 'test2Id', 'other3Id']});
        let res = await job.duplicateTaskInTaskGroup('try', fakeQueue, 'buildId');
        assert.equal(res, 'tgid');
        let newTaskIds = _.reduce(fakeQueue.createdTasks, (result, create) => {
          result[create.taskDef.payload] = create.taskId;
          return result;
        }, {});
        _.forEach(fakeQueue.createdTasks, create => create.taskDef.dependencies.sort());
        assert.deepEqual(fakeQueue.createdTasks, [
          {
            "taskDef": {
              "dependencies": ["other1Id"].sort(),
              "payload": "build",
              "taskGroupId": "tgid"
            },
            "taskId": newTaskIds['build']
          },
          {
            "taskDef": {
              "dependencies": ["other2Id", newTaskIds['build']].sort(),
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
                "other3Id",
                newTaskIds['test1'],
                newTaskIds['test2']
              ].sort(),
              "payload": "sign"
            },
            "taskId": newTaskIds['sign']
          }
        ]);
      });
      test("duplicating a subgraph replaces task IDs referenced in task definition", async function() {
        // Using a payload more like production task payloads will help ensure that
        // task Ids nested deeper get replaced.
        let objectPayload = {
          command: "test1",
          image: {
            type: "task-image",
            taskId: "buildId"
          }
        };
        fakeQueue.addTask('buildId', {payload: 'build', dependencies: [], taskGroupId: 'tgid'});
        fakeQueue.addTask('test1Id', {payload: objectPayload, dependencies: ['buildId']});
        let res = await job.duplicateTaskInTaskGroup('try', fakeQueue, 'buildId');
        let newTaskIds = _.reduce(fakeQueue.createdTasks, (result, create) => {
          result[create.taskDef.payload] = create.taskId;
          return result;
        }, {});
        _.forEach(fakeQueue.createdTasks, create => create.taskDef.dependencies.sort());
        objectPayload.image.taskId = newTaskIds['build'];
        assert.deepEqual(fakeQueue.createdTasks, [
          {
            "taskDef": {
              "dependencies": [],
              "payload": "build",
              "taskGroupId": "tgid"
            },
            "taskId": newTaskIds['build']
          },
          {
            "taskDef": {
              "dependencies": [newTaskIds['build']],
              "payload": objectPayload
            },
            "taskId": newTaskIds[objectPayload]
          }
        ]);
        assert.notEqual(fakeQueue.createdTasks[1].taskDef.payload.image.taskId, 'buildId');
      });
    });
  });
});

