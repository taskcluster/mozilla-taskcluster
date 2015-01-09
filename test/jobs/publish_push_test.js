import assert from 'assert';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import * as kueUtils from '../kue';

suite('jobs/publish_push', function() {
  let monitorSetup = testSetup('workers.js');
  let repos;
  setup(function() {
    repos = this.runtime.repositories;
  });

  test('update after a push', async function() {
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

    monitorSetup.pushlog.push(changesets);

    // Consume the queue now that the event has been sent...
    let [ message ] = await Promise.all([
      eventToPromise(this.listener, 'message'),
      this.listener.resume()
    ]);

    assert.equal(message.payload.id, '1');
    assert.equal(message.payload.url, monitorSetup.url);
    assert.deepEqual(
      message.payload.changesets,
      changesets.map((v) => {
        let result = Object.assign({}, v);
        result.description = result.desc;
        delete result.desc;
        return result;
      })
    );

    await kueUtils.ensureFinished(this.runtime);
  });
});
