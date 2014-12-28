import Client from '../../src/repository_monitor/pushlog_client';
import pushlog from './pushlog'
import assert from 'assert';

suite('repository_monitor/pushlog_client', function() {

  let server, numberOfPushes = 1000, pushes = {};
  suiteSetup(async function() {
    server = await pushlog();
    for (let i = 1; i <= numberOfPushes; i++) {
      let push = { value: i };
      server.push(push);
    }
  });

  suiteTeardown(async function() {
    await server.stop();
  });

  let client;
  setup(function() {
    client = new Client();
  });

  test('get()', async function() {
    let res = await client.get(server.url, 199, 220);
    assert.deepEqual(res.range, { start: 200, end: 220 });
    assert.equal(res.lastPushId, 1000);

    let expected = [];
    for (let i = 200; i <= 220; i++) {
      let push = Object.assign({}, server.pushes[i]);
      push.id = String(i);
      expected.push(push);
    }
    assert.deepEqual(res.pushes, expected);
  });
});
