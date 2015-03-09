import Client from '../../src/repository_monitor/pushlog_client';
import createHg from '../hg'
import assert from 'assert';

suite('repository_monitor/pushlog_client', function() {

  let range = (start, end) => {
    let result = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  };

  let hg, numberOfPushes = 30, pushes = {};
  suiteSetup(async function() {
    hg = await createHg(this.compose);
    for (let i = 1; i <= numberOfPushes; i++) {
      await hg.write('file', `bla bla ${i}`);
      await hg.commit();
      await hg.push();
    }
  });

  suiteTeardown(async function() {
    await hg.destroy();
  });

  let client;
  setup(function() {
    client = new Client();
  });

  test('get()', async function() {
    let res = await client.get(hg.url, 7, 27);
    assert.deepEqual(res.range, { start: 8, end: 27 });
    assert.equal(res.lastPushId, numberOfPushes);
    assert.deepEqual(
      res.pushes.map(v => v.id),
      range(8, 27).map(v => String(v))
    );
  });

  test('getOne()', async function() {
    let push = await client.getOne(hg.url, 17);
    assert.equal(push.id, 17);
  });

  suite('iterate()', function() {
    test('odd numbers', async function() {
      let pushed = [];
      await client.iterate(hg.url, 3, 27, async function(item) {
        pushed.push(parseInt(item.id, 10));
      });
      assert.deepEqual(pushed, range(4, 27));
    });

    test('even numbers beyond actual', async function() {
      let pushed = [];
      await client.iterate(hg.url, 21, 4000, async function(item) {
        pushed.push(parseInt(item.id, 10));
      });
      assert.deepEqual(pushed, range(22, 30));
    });
  });

});
