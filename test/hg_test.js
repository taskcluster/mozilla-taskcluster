import assert from 'assert';
import createHg from './hg';
import fs from 'mz/fs';
import request from 'superagent-promise';

suite('hg', function() {

  test('create / destroy', async function() {
    let hg = await createHg(this.compose);
    assert(await fs.exists(hg.path), 'clones hg');
    assert(await fs.exists(hg.path + '/.hg'), 'is proper hg clone');
    await hg.destroy();
    assert(!await fs.exists(hg.path), 'removes clone');
  });

  suite('using hg', function() {
    let hg;
    setup(async function() {
      hg = await createHg(this.compose);
    });

    teardown(async function() {
      await hg.destroy();
    });

    test('write/commit', async function() {
      await hg.write('a', 'a');
      await hg.write('b', 'b');
      await hg.write('c', 'c');

      await hg.commit('woot I did something', 'mozilla@example.com');

      let log = await hg.log();
      assert.equal(log[0].user, 'mozilla@example.com');
    });

    test('push', async function() {
      let remainder = 3;
      while (remainder-- > 0) {
        await hg.write('a', `remainder ${remainder}`);
        await hg.commit(`did something at ${remainder}`);
        await hg.push();
      }

      let url = `${hg.url}/json-pushes/`;
      let res = await request.get(url).end();
      let body = res.body;

      assert.equal(Object.keys(body).length, 3, 'correctly pushes 3 times');
    });
  });
})
