import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import PushlogClient from '../../src/repository_monitor/pushlog_client';

suite('jobs/publish_push', function() {
  let monitorSetup = testSetup('workers.js');
  let pushlog = new PushlogClient();

  test('update after a push', async function() {
    // Bind the queue...
    await this.listener.connect();
    await this.listener.bind(this.events.push());

    // Create the push...
    let commits = 3;
    while (--commits) {
      await monitorSetup.hg.write('stuff');
      await monitorSetup.hg.commit();
    }
    await monitorSetup.hg.push();
    let push = await pushlog.getOne(monitorSetup.url, 1);

    // Consume the queue now that the event has been sent...
    let [ message ] = await Promise.all([
      eventToPromise(this.listener, 'message'),
      this.listener.resume()
    ]);

    assert.equal(message.payload.id, '1');
    assert.equal(message.payload.url, monitorSetup.url);
    assert.deepEqual(
      message.payload.changesets,
      push.changesets
    );
  });
});
