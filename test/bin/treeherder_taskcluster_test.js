import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import * as kueUtils from '../kue';
import createResultset from '../../src/treeherder/resultset';
import slugid from 'slugid';

import TreeherderHelper from '../treeherder';
import TaskclusterHelper from '../taskcluster';

let Joi = require('joi');


suite('bin/treeherder_taskcluster.js', function() {
  let monitorSetup = testSetup('workers.js', 'taskcluster_treeherder.js');

  // prior to testing anything we need to create a resultset...
  let treeherder;
  let taskcluster;
  let revisionHash;
  setup(async function() {
    treeherder = new TreeherderHelper(this.config.treeherder.apiUrl);
    taskcluster = new TaskclusterHelper(this.queue);

    let changesets = [
      {
       author: 'Author <user@domain.com>',
       branch: 'default',
       desc: 'desc',
       files: [
        'xfoobar'
       ],
       node: slugid.v4(),
       tags: []
      }
    ];

    let resultset = createResultset('try', {
      changesets
    });
    revisionHash = resultset.revision_hash;

    monitorSetup.pushlog.push(changesets);
    await treeherder.waitForResultset(revisionHash);
  });

  test('symbol + machine customizations', async function() {
    let route = [
      this.config.treeherderTaskcluster.routePrefix,
      'try',
      revisionHash
    ].join('.');

    let taskId = await taskcluster.createTask({
      routes: [route],
      extra: {
        treeherder: {
          build: {
            platform: 'zomgplatform',
            os: 'zomg',
            architecture: 'wootbar'
          },
          machine: {
            platform: 'wootbar_machine',
            os: 'madeup',
            architecture: 'value'
          },
          symbol: 'ZZ',
          collection: {
            debug: true
          }
        }
      }
    });

    // Wait for task to be in the pending state...
    let job = await treeherder.waitForJobState(revisionHash, 'pending');

    Joi.assert(job, Joi.object().keys({
      who: Joi.string().valid('user@example.com'),
      job_type_name: Joi.string().valid('Example Task name'),
      job_type_symbol: Joi.string().valid('ZZ'),

      build_platform: Joi.string().valid('zomgplatform'),
      build_os: Joi.string().valid('zomg'),
      build_architecture: Joi.string().valid('wootbar'),

      platform: Joi.string().valid('wootbar_machine'),
      machine_platform_os: Joi.string().valid('madeup'),
      machine_platform_architecture: Joi.string().valid('value'),

      platform_option: Joi.string().valid('debug')
    }).unknown(true))
  });

  test('state transition -> pending -> running -> completed', async function() {
    let route = [
      this.config.treeherderTaskcluster.routePrefix,
      'try',
      revisionHash
    ].join('.');

    let taskId = await taskcluster.createTask({
      routes: [route]
    });

    // Wait for task to be in the pending state...
    await treeherder.waitForJobState(revisionHash, 'pending');

    // Claim task so it is running...
    await this.queue.claimTask(taskId, 0, {
      workerGroup: 'test',
      workerId: 'test'
    });
    await treeherder.waitForJobState(revisionHash, 'running');

    // Report completed + success...
    await this.queue.reportCompleted(taskId, 0, { success: true });
    let job = await treeherder.waitForJobState(revisionHash, 'completed');
    assert.equal(job.result, 'success');
  });

  test('state transition -> pending -> running -> failed', async function() {
    let route = [
      this.config.treeherderTaskcluster.routePrefix,
      'try',
      revisionHash
    ].join('.');

    let taskId = await taskcluster.createTask({
      routes: [route]
    });

    // Wait for task to be in the pending state...
    await treeherder.waitForJobState(revisionHash, 'pending');

    // Claim task so it is running...
    await this.queue.claimTask(taskId, 0, {
      workerGroup: 'test',
      workerId: 'test'
    });
    await treeherder.waitForJobState(revisionHash, 'running');

    // Report completed + success...
    await this.queue.reportCompleted(taskId, 0, { success: false });
    let job = await treeherder.waitForJobState(revisionHash, 'completed');
    assert.equal(job.result, 'testfailed');
  });

  test('state transition -> pending -> running -> exception', async function() {
    let route = [
      this.config.treeherderTaskcluster.routePrefix,
      'try',
      revisionHash
    ].join('.');

    let taskId = await taskcluster.createTask({
      routes: [route]
    });

    // Wait for task to be in the pending state...
    await treeherder.waitForJobState(revisionHash, 'pending');

    // Claim task so it is running...
    await this.queue.claimTask(taskId, 0, {
      workerGroup: 'test',
      workerId: 'test'
    });
    await treeherder.waitForJobState(revisionHash, 'running');

    // Report completed + success...
    await this.queue.reportException(taskId, 0, {
      reason: 'malformed-payload'
    });

    let job = await treeherder.waitForJobState(revisionHash, 'completed');
    assert.equal(job.result, 'exception');
  });



});
