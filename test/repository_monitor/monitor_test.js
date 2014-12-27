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
    repos = new Repositories(this.connection);
    subject = new Monitor(repos);
    await repos.create({
      url: server.url,
      alias: alias
    });
  });

  teardown(async function() {
    await server.stop();
    subject.stop();
  });

  suite('interval checks', function() {
    setup(async function() {
      // Just FTR 0 is a crazy number in any but testing cases...
      await subject.start(0);
    });

    test('updates after pushing', async function() {
      server.push();
      let result = await waitFor({ sleep: 100 }, async function() {
        let doc = await repos.findById(Repositories.hashUrl(server.url));
        return doc.lastPushId === 1;
      });
    });
  });
});
