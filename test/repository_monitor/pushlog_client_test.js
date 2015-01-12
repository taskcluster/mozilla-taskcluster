import Client from '../../src/repository_monitor/pushlog_client';
import pushlog from '../pushlog'
import assert from 'assert';

suite('repository_monitor/pushlog_client', function() {

  let range = (start, end) => {
    let result = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  };

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

  suite('iterate()', function() {
    test('odd numbers', async function() {
      let pushed = [];
      await client.iterate(server.url, 197, 215, async function(item) {
        pushed.push(parseInt(item.id, 10));
      });
      assert.deepEqual(pushed, range(198, 215));
    });

    test('even numbers beyond actual', async function() {
      let pushed = [];
      await client.iterate(server.url, 899, 4000, async function(item) {
        pushed.push(parseInt(item.id, 10));
      });
      assert.deepEqual(pushed, range(900, 1000));
    });
  });

});
