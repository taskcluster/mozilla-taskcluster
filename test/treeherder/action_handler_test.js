import * as kueUtils from '../kue';
import amqpPublish from '../amqp_publish';
import assert from 'assert';
import createResultset from '../../src/treeherder/resultset';
import eventToPromise from 'event-to-promise';
import slugid from 'slugid';
import testSetup from '../monitor';
import waitFor from '../wait_for';

import Project from 'mozilla-treeherder/project';
import TaskclusterHelper from '../taskcluster';
import TreeherderHelper from '../treeherder';
import Joi from 'joi';

suite('bin/treeherder_taskcluster.js', function() {
  let monitorSetup = testSetup('workers.js', 'pulse_listener.js');

  async function submitAction(config, type, job) {
    let payload = {
      job_id: job.id,
      job_guid: job.job_guid,
      project: 'try',
      action: 'retrigger',
      requester: job.who
    };

    let exchange = config.treeherderActions.exchange;
    let routing = `taskcluster.try.${type}`;

    await amqpPublish(config, {
      payload, exchange, routing
    });
  }

  // prior to testing anything we need to create a resultset...
  let treeherder;
  let taskcluster;
  let revisionHash;
  let route;
  setup(async function() {
    treeherder = new TreeherderHelper(this.config.treeherder.apiUrl);
    taskcluster = new TaskclusterHelper(this.scheduler);
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

    route = [
      this.config.treeherderTaskcluster.routePrefix,
      'try',
      revisionHash
    ].join('.');
  });

  test('issue retrigger from pending state', async function() {
    let [, taskId] = await taskcluster.createTaskGraph({
      tasks: [{
        task: {
          routes: [route]
        }
      }]
    });

    let job = await treeherder.waitForJobState(
      revisionHash,
      taskId,
      0,
      'pending'
    );

    await submitAction(this.config, 'retrigger', job);
  });

});
