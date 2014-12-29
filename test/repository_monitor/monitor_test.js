import db from '../../src/db';
import * as Joi from 'joi';
import uuid from 'uuid';
import assert from 'assert';
import http from 'http';
import waitFor from '../wait_for';

import collectionSetup from '../collection';
import pushlog from './pushlog';
import Repositories from '../../src/collections/repositories';
import Monitor from '../../src/repository_monitor/monitor';

suite('repository_monitor/monitor', function() {
  collectionSetup();

  let server, url;
  setup(async function() {
    server = await pushlog();
  });

  let subject, repos, alias = 'localhost';
  setup(async function() {
    repos = this.runtime.repositories;
    subject = new Monitor(
      this.runtime.kue,
      repos
    );

    await repos.create({
      url: server.url,
      alias: alias
    });
  });

  teardown(async function() {
    subject.stop();
    await server.stop();
  });

  suite('interval checks', function() {
    setup(async function() {
      await subject.start(500);
    });

    test('updates after pushing', async function() {
      let pushJobs = [];
      this.runtime.kue.process('push', function(job, done) {
        pushJobs.push(job);
        done();
      });

      let push = [
        { node: 'wootbar' }
      ];

      server.push(push);
      let result = await waitFor(async function() {
        let doc = await repos.findById(Repositories.hashUrl(server.url));
        return doc.lastPushId === 1;
      });

      await waitFor(async function() {
        if (pushJobs.length === 1) {
          let data = pushJobs[0].data;
          let title = data.title;
          assert.ok(
            title.indexOf(push[0].node) !== -1,
            `${title} contains ${push[0].node}`
          );
          assert.deepEqual(server.pushes[1].changesets, data.push.changesets);
          return true;
        }
      });
    });
  });
});
