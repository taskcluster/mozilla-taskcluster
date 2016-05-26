import assert from 'assert';
import _ from 'lodash';
import slugid from 'slugid';
import {GroupDuplicator} from '../../build/taskcluster/duplicator';
import FakeQueue from '../fakequeue';

suite('taskcluster/duplicator', function() {
  suite('GroupDuplicator', function() {
    let checkReturnValuesMatch = (taskNodes, res, expectedOldTaskIds) => {
      assert.deepEqual(res.sort(), _.values(taskNodes).sort());
      assert.deepEqual(_.keys(taskNodes).sort(), expectedOldTaskIds.sort())
      let newTaskId = {};
      _.forEach(taskNodes, (node, oldTaskId) => { newTaskId[oldTaskId] = node.taskId; });
      return newTaskId;
    };

    let duplicator, fakeQueue;

    setup(function() {
      fakeQueue = new FakeQueue();
      duplicator = new GroupDuplicator(fakeQueue);
    });

    test("duplicating a single node creates a matching task, with taskGroupId and requires intact", async function() {
      fakeQueue.addTask('single', {payload: 'test', requires: 'all-complete', taskGroupId: 'just-the-best-tasks'});
      let taskNodes = {};
      let res = await duplicator.duplicateGroupNode(taskNodes, 'single', true);
      checkReturnValuesMatch(taskNodes, res, ['single']);
      assert.deepEqual(taskNodes['single'].task.payload, 'test');
      assert.deepEqual(taskNodes['single'].task.requires, 'all-complete');
      assert.deepEqual(taskNodes['single'].task.taskGroupId, 'just-the-best-tasks');
    });

    test("duplicating a node with dependencies=false creates a single matching task", async function() {
      fakeQueue.addTask('test', {payload: 'test', dependencies: ['build']});
      fakeQueue.addTask('build', {payload: 'build'});
      let taskNodes = {};
      let res = await duplicator.duplicateGroupNode(taskNodes, 'build', false);
      checkReturnValuesMatch(taskNodes, res, ['build']);
      assert.deepEqual(taskNodes['build'].task.payload, 'build');
    });

    test("duplicating a node with a lot of deps captures those deps", async function() {
      fakeQueue.addTask('build', {payload: 'build'});
      fakeQueue.addTask('test1', {payload: 'test1', dependencies: ['build']});
      fakeQueue.addTask('test2', {payload: 'test2', dependencies: ['build']});
      fakeQueue.addTask('test3', {payload: 'test3', dependencies: ['build']});
      fakeQueue.addTask('test4', {payload: 'test4', dependencies: ['build']});
      let taskNodes = {};
      let res = await duplicator.duplicateGroupNode(taskNodes, 'build', true);
      let newTaskId = checkReturnValuesMatch(taskNodes, res,
        ['build', 'test1', 'test2', 'test3', 'test4']);
      assert.deepEqual(taskNodes['build'].task.payload, 'build');
      assert.deepEqual(taskNodes['build'].task.dependencies, []);
      assert.deepEqual(taskNodes['test1'].task.payload, 'test1');
      assert.deepEqual(taskNodes['test1'].task.dependencies, [newTaskId['build']]);
      assert.deepEqual(taskNodes['test2'].task.payload, 'test2');
      assert.deepEqual(taskNodes['test2'].task.dependencies, [newTaskId['build']]);
      assert.deepEqual(taskNodes['test3'].task.payload, 'test3');
      assert.deepEqual(taskNodes['test3'].task.dependencies, [newTaskId['build']]);
      assert.deepEqual(taskNodes['test4'].task.payload, 'test4');
      assert.deepEqual(taskNodes['test4'].task.dependencies, [newTaskId['build']]);
    });

    test("duplicating a subgraph maintains external dependencies", async function() {
      fakeQueue.addTask('build', {payload: 'build', dependencies: ['other1']});
      fakeQueue.addTask('test1', {payload: 'test1', dependencies: ['build', 'other2']});
      let taskNodes = {};
      let res = await duplicator.duplicateGroupNode(taskNodes, 'build', true);
      let newTaskId = checkReturnValuesMatch(taskNodes, res, ['build', 'test1']);
      assert.deepEqual(taskNodes['build'].task.payload, 'build');
      assert.deepEqual(taskNodes['build'].task.dependencies, ['other1']);
      assert.deepEqual(taskNodes['test1'].task.payload, 'test1');
      assert.deepEqual(taskNodes['test1'].task.dependencies.sort(), [newTaskId['build'], 'other2'].sort());
    });

    test("duplicating a diamond-shaped subgraph gets dependencies right", async function() {
      fakeQueue.addTask('build', {payload: 'build', dependencies: ['other1']});
      fakeQueue.addTask('test1', {payload: 'test1', dependencies: ['build', 'other2']});
      fakeQueue.addTask('test2', {payload: 'test2', dependencies: ['build']});
      fakeQueue.addTask('sign', {payload: 'sign', dependencies: ['test1', 'test2', 'other3']});
      let taskNodes = {};
      let res = await duplicator.duplicateGroupNode(taskNodes, 'build', true);
      let newTaskId = checkReturnValuesMatch(taskNodes, res,
        ['build', 'test1', 'test2', 'sign']);
      assert.deepEqual(taskNodes['build'].task.payload, 'build');
      assert.deepEqual(taskNodes['build'].task.dependencies, ['other1']);
      assert.deepEqual(taskNodes['test1'].task.payload, 'test1');
      assert.deepEqual(taskNodes['test1'].task.dependencies.sort(), [newTaskId['build'], 'other2'].sort());
      assert.deepEqual(taskNodes['test2'].task.payload, 'test2');
      assert.deepEqual(taskNodes['test2'].task.dependencies, [newTaskId['build']]);
      assert.deepEqual(taskNodes['sign'].task.payload, 'sign');
      assert.deepEqual(taskNodes['sign'].task.dependencies.sort(),
        [newTaskId['test1'], newTaskId['test2'], 'other3'].sort());
    });
  });
});
