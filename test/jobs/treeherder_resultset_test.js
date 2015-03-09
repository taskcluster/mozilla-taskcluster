import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';

import createResultset from '../../src/treeherder/resultset';
import PushlogClient from '../../src/pushlog/client';

suite('jobs/treeherder_resultset', function() {
  let monitorSetup = testSetup('workers.js');
  let pushlog = new PushlogClient();

  test('update after a push', async function() {
    // Stage the commits with some interesting data...
    await monitorSetup.hg.write('a/with/path');
    await monitorSetup.hg.write('b/path');
    await monitorSetup.hg.write('c');
    await monitorSetup.hg.commit();

    await monitorSetup.hg.write('next', 'did a commit!');
    await monitorSetup.hg.commit();
    await monitorSetup.hg.push();

    let push = await pushlog.getOne(monitorSetup.url, 1);

    let expectedResultset = createResultset('try', {
      user: push.user,
      date: push.date,
      changesets: push.changesets
    });

    await waitFor(async function() {
      let res = await this.treeherder.getResultset();
      let target = res.results[0];
      if (!target) return false;
      return target.revision_hash === expectedResultset.revision_hash;
    }.bind(this));
  });
});

