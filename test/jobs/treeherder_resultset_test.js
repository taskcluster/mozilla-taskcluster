import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';

import createResultset from '../../src/treeherder/resultset';

suite('jobs/treeherder_resultset', function() {
  let monitorSetup = testSetup('workers.js');

  test('update after a push', async function() {
    let author = 'me';
    let date = Math.floor(Date.now() / 1000);
    let changesets = [
      {
       author: 'Author <user@domain.com>',
       branch: 'default',
       desc: 'desc',
       files: [
        'xfoobar'
       ],
       node: `commit-0-${Date.now()}`,
       tags: []
      },
      {
       author: 'Author <user@domain.com>',
       branch: 'default',
       desc: 'desc',
       files: [
        'xfoobar'
       ],
       node: `commit-1-${Date.now()}`,
       tags: []
      },
    ];

    let expectedResultset = createResultset('try', {
      author,
      date,
      changesets
    })

    monitorSetup.pushlog.push(changesets);

    await waitFor(async function() {
      let res = await this.treeherder.getResultset();
      let target = res.results[0];
      if (!target) return false;
      return target.revision_hash === expectedResultset.revision_hash;
    }.bind(this));
  });
});

