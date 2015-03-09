import * as kueUtils from '../kue';
import amqpPublish from '../amqp_publish';
import assert from 'assert';
import createResultset from '../../src/treeherder/resultset';
import eventToPromise from 'event-to-promise';
import slugid from 'slugid';
import testSetup from '../monitor';
import waitFor from '../wait_for';
import merge from 'lodash.merge';

import Project from 'mozilla-treeherder/project';
import TaskclusterHelper from '../taskcluster';
import TreeherderHelper from '../treeherder';
import Joi from 'joi';

suite('action handler', function() {
  let monitorSetup = testSetup('workers.js', 'pulse_listener.js');

  // It's easier to mock this then have treeherder submit information
  // directly...
  async function submitAction(config, type, taskId, runId, requester) {
    let payload = {
      job_id: 111111,
      job_guid: `${slugid.decode(taskId)}/${runId}`,
      project: 'try',
      action: 'retrigger',
      requester,
    };

    let exchange = config.treeherderActions.exchange;
    let routing = `taskcluster.try.${type}`;

    await amqpPublish(config, {
      payload, exchange, routing
    });
  }

  async function submitGraph(ctx, graph) {
    let taskGraphId = slugid.v4();
    await ctx.scheduler.createTaskGraph(taskGraphId, graph);
    return taskGraphId;
  }

  async function failTask(ctx, taskId) {
    await ctx.queue.claimTask(taskId, 0, {
      workerId: 'test',
      workerGroup: 'test',
    });
    await ctx.queue.reportFailed(taskId, 0);
  }

  /**
  Retrigger the job and capture the event from the retrigger exchange.
  */
  async function retriggerMessage(ctx, taskId) {
    await ctx.listener.connect();
    await ctx.listener.bind(ctx.events.retrigger());

    await submitAction(ctx.config, 'retrigger', taskId, 0, 'user@example.com');

    let [msg] = await Promise.all([
      eventToPromise(ctx.listener, 'message'),
      ctx.listener.resume()
    ]);

    return msg;
  }

  function graphNode(name, overrides = {}) {
    return merge({
        taskId: slugid.v4(),
        task: {
          provisionerId:  'test',
          schedulerId:    'task-graph-scheduler',
          workerType:     'test',
          created:        new Date().toJSON(),
          deadline:       new Date(new Date().getTime() + 60 * 60 * 5).toJSON(),
          routes: [],
          payload: {},
          metadata: {
            name:         name,
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
    }, overrides);
  }

  function indexByKey(input, prop) {
    return input.reduce((result, v) => {
      result[v[prop]] = v;
      return result;
    }, {});
  }

  // prior to testing anything we need to create a resultset...
  let treeherder;
  let taskcluster;
  let revisionHash;
  let route;
  setup(async function() {
    taskcluster = new TaskclusterHelper(this.scheduler);
  });

  test('issue retrigger from pending', async function() {
    let nodeOne = graphNode('first', {
      reruns: 17,
    });
    let nodeTwo = graphNode('two', { requires: [nodeOne.taskId] });
    let graph = {
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
      tasks: [nodeOne, nodeTwo]
    };

    await submitGraph(this, graph);
    let msg = await retriggerMessage(this, nodeOne.taskId);

    let payload = msg.payload;
    let newGraph = await this.scheduler.inspect(payload.taskGroupId);
    assert.equal(newGraph.tasks.length, 1);
    assert.equal(newGraph.tasks[0].name, nodeOne.task.metadata.name);
    // Rerun values should be copied too!
    assert.equal(newGraph.tasks[0].reruns, 17);
  });

  test('issue retrigger from exception', async function() {
    let nodeOne = graphNode('one');
    let nodeTwo = graphNode('two', {
      requires: [nodeOne.taskId]
    });

    let graph = {
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
      tasks: [nodeOne, nodeTwo]
    };

    await submitGraph(this, graph);
    await failTask(this, nodeOne.taskId);
    let msg = await retriggerMessage(this, nodeOne.taskId);

    let payload = msg.payload;
    let newGraph = await this.scheduler.inspect(payload.taskGroupId);

    // Creates both nodes in the graph...
    assert.equal(newGraph.tasks.length, 2);

    let tasks = indexByKey(newGraph.tasks, 'name');
    assert.ok(tasks.one, 'has nodeOne');
    assert.ok(tasks.two, 'has nodeTwo');

    // Second task depends on first with it's new task id...
    assert.deepEqual(
      tasks.two.requires,
      [tasks.one.taskId]
    );
  });

  test('multi dep', async function() {
    let nodeOne = graphNode('one');
    let nodeTwo = graphNode('two', { requires: [nodeOne.taskId] });
    let nodeThree = graphNode('three', { requires: [nodeTwo.taskId] });
    let nodeFour = graphNode('four', { requires: [nodeThree.taskId] });
    let nodeFourDepOne = graphNode('four-d1', { requires: [nodeFour.taskId] });
    let nodeFourDepTwo = graphNode('four-d2', { requires: [nodeFour.taskId] });

    let graph = {
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
      tasks: [
        nodeOne, nodeTwo, nodeThree, nodeFour,
        nodeFourDepOne, nodeFourDepTwo
      ]
    };

    await submitGraph(this, graph);
    await failTask(this, nodeOne.taskId);
    let msg = await retriggerMessage(this, nodeOne.taskId);

    let payload = msg.payload;
    let newGraph = await this.scheduler.inspect(payload.taskGroupId);

    // Creates both nodes in the graph...
    assert.equal(newGraph.tasks.length, 6);

    let newTasks = indexByKey(newGraph.tasks, 'name');

    // level 0
    assert.deepEqual(newTasks.one.requires, []);
    // level 1
    assert.deepEqual(newTasks.two.requires, [newTasks.one.taskId]);
    // level 2
    assert.deepEqual(newTasks.three.requires, [newTasks.two.taskId]);
    // level 3
    assert.deepEqual(newTasks.four.requires, [newTasks.three.taskId]);
    // level 4 + multi dep
    assert.deepEqual(newTasks.four.dependents, [
      newTasks['four-d1'].taskId,
      newTasks['four-d2'].taskId
    ]);
  });

});
