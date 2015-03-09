import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import * as kueUtils from '../kue';

import Repositories from '../../src/collections/repositories';

suite('bin/pushlog_monitor_test.js', function() {
  let monitorSetup = testSetup();
  let repos;
  setup(function() {
    repos = this.runtime.repositories;
  });

  async function push() {
    await monitorSetup.hg.write('a');
    await monitorSetup.hg.commit();
    await monitorSetup.hg.push();

    return (await monitorSetup.hg.log())[0];
  }

  test('updates after pushing', async function() {
    let firstPush = await push();
    let result;
    let doc;
    result = await waitFor(async function() {
      doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
      return doc.lastPushId === 1;
    });

    doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
    assert.equal(doc.lastChangeset, firstPush.node);

    let secondPush = await push();
    result = await waitFor(async function() {
      let doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
      return doc.lastPushId === 2;
    });

    doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
    assert.equal(doc.lastChangeset, secondPush.node);
  });
});

