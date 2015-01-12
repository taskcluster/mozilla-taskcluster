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

  test('updates after pushing', async function() {
    let changesetsOne = [
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
      {
       author: 'Author <user@domain.com>',
       branch: 'default',
       desc: 'desc',
       files: [
        'xfoobar'
       ],
       node: 'commit-2',
       tags: []
      }
    ];

    let changesetsTwo = [
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

    monitorSetup.pushlog.push(changesetsOne);
    let result = await waitFor(async function() {
      let doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
      return doc.lastPushId === 1;
    });

    let doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
    assert.equal(
      doc.lastChangeset, changesetsOne[changesetsOne.length - 1].node
    );

    monitorSetup.pushlog.push(changesetsTwo);
    let result = await waitFor(async function() {
      let doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
      return doc.lastPushId === 2;
    });

    let doc = await repos.findById(Repositories.hashUrl(monitorSetup.url));
    assert.equal(doc.lastChangeset, changesetsTwo[changesetsTwo.length - 1].node);
  });
});

