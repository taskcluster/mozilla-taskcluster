import pushlog from './pushlog'
import request from 'superagent-promise';
import denodeify from 'denodeify';
import assert from 'assert';

suite('pushlog', function() {
  let server;
  suiteSetup(async function() {
    server = await pushlog();
  });

  suiteTeardown(async function() {
    await server.stop();
  });

  async function get(query={}) {
    let qs = Object.assign({}, query);
    let path = `${server.url}/json-pushes/`
    let res = await request.get(path).query(query).end();
    return res.body;
  }

  test('full+v2', async function() {
    let res = await get({ version: 2, full: 1 });
    assert.equal(res.lastpushid, 0);
  });

  test('get()', async function() {
    let a = { a: true };
    let b = { b: true };
    let c = { c: true };

    [a, b, c].forEach((value) => { server.push(value); });

    let all = await get();
    assert.equal(all.lastpushid, 3);

    let fetchB = await get({ startID: 1, endID: 2 });
    assert.deepEqual(fetchB.pushes[2].changesets, b);
    assert.deepEqual(Object.keys(fetchB.pushes), ['2']);

    let fetchBC = await get({ startID: 1 });
    assert.deepEqual(Object.keys(fetchBC.pushes), ['2', '3']);

    let fetchABC = await get({ startID: 0, endID: 3 });
    assert.deepEqual(Object.keys(fetchABC.pushes), ['1', '2', '3']);
  });
});
