import db from '../../src/db';
import * as Joi from 'joi';
import uuid from 'uuid';
import assert from 'assert';
import http from 'http';
import eventToPromise from 'event-to-promise';
import collectionSetup from '../collection';
import pushlog from './pushlog';
import waitFor from '../wait_for';
import createProc from '../process';
import denodeify from 'denodeify';
import * as kueUtils from '../kue';

import Repositories from '../../src/collections/repositories';

suite('repository_monitor/monitor', function() {
  collectionSetup();

  let server, url;
  suiteSetup(async function() {
    server = await pushlog();
  });

  let repos, alias = 'localhost', monitor, pushworker;
  suiteSetup(async function() {
    repos = this.runtime.repositories;
    await repos.create({
      url: server.url,
      alias: alias
    });

    [ monitor, pushworker ] = await Promise.all([
      await createProc('pushlog_monitor.js'),
      await createProc('push_worker.js')
    ]);
  });

  suiteTeardown(async function() {
    await monitor.kill();
    await pushworker.kill();
    await server.stop();
  });

  suite('interval checks', function() {
    test('updates after pushing', async function() {
      let changesets = [
        {
         author: 'Author <user@domain.com>',
         branch: 'default',
         desc: 'desc',
         files: [
          'xfoobar'
         ],
         node: 'commit-0',
         tags: []
        },
        {
         author: 'Author <user@domain.com>',
         branch: 'default',
         desc: 'desc',
         files: [
          'xfoobar'
         ],
         node: 'commit-1',
         tags: []
        },
      ];

      // Bind the queue...
      await this.listener.connect();
      await this.listener.bind(this.pushEvents.push());

      server.push(changesets);
      let result = await waitFor(async function() {
        let doc = await repos.findById(Repositories.hashUrl(server.url));
        return doc.lastPushId === 1;
      });

      let doc = await repos.findById(Repositories.hashUrl(server.url));
      assert.equal(doc.lastChangeset, changesets[changesets.length - 1].node);

      // Consume the queue now that the event has been sent...
      let [ message ] = await Promise.all([
        eventToPromise(this.listener, 'message'),
        this.listener.resume()
      ]);

      assert.equal(message.payload.id, '1');
      assert.equal(message.payload.url, server.url);
      assert.deepEqual(
        message.payload.changesets,
        changesets.map((v) => {
          let result = Object.assign({}, v);
          result.description = result.desc;
          delete result.desc;
          return result;
        })
      );

      await waitFor(async function() {
        let stats = await kueUtils.stats(this.runtime);

        return stats.complete === 1 &&
               stats.incomplete === 0 &&
               stats.active === 0;

      }.bind(this));
    });
  });
});
