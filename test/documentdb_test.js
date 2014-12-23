import * as documentdb from 'documentdb-q-promises';
import * as subject from '../src/collection';

import * as Joi from 'joi';
import uuid from 'uuid';
import assert from 'assert';

let url = 'https://stage-treeherder-proxy.documents.azure.com:443/';
let client = new documentdb.DocumentClientWrapper(url, {
  masterKey: 'RMMBgZ7iNxcohzoc/ZgtB9dez0InyfpeomPP1F2G6dDcWwc4rwyQRsRdXL03Nd6VPKmW7dxd+SGrUqcXoj/DCA=='
});

suite('documentdb', function() {
  let Data = subject.define('repository').
    schema(Joi.object().keys({
      url: Joi.string().required(),
    }));

  let connection, db = uuid.v4();
  setup(async function() {
    connection = await subject.connect(client, db, [
      Data
    ]);
  });

  teardown(async function() {
    await connection.destroy();
  });

  test('create connection', async function() {
    let dbs = await client.readDatabases().toArrayAsync();
    let ids = dbs.feed.reduce(function(current, db) {
      current[db.id] = db;
      return current;
    }, {});
    assert(ids[db], 'database was created...');
  });

  test('validate()', async function() {
    await Data.validate({
      url: 'http://github.com'
    });
  });
});
