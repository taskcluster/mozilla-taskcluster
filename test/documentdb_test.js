import * as documentdb from 'documentdb';
import * as subject from '../src/collection';

import * as Joi from 'joi';
import uuid from 'uuid';
import assert from 'assert';

let url = 'https://stage-treeherder-proxy.documents.azure.com:443/';
let client = new documentdb.DocumentClient(url, {
  masterKey: 'RMMBgZ7iNxcohzoc/ZgtB9dez0InyfpeomPP1F2G6dDcWwc4rwyQRsRdXL03Nd6VPKmW7dxd+SGrUqcXoj/DCA=='
});

suite('documentdb', function() {
  let Data = subject.define('repository').
    schema(Joi.object().keys({
      id: Joi.string().min(1).required(),
      url: Joi.string().required(),
    }));

  let connection, db = uuid.v4();
  suiteSetup(async function() {
    connection = await subject.connect(client, db, [
      Data
    ]);
  });

  suiteTeardown(async function() {
    await connection.destroy();
  });

  test('create connection second time', async function() {
    let con = await subject.connect(client, db, [Data]);
  });

  suite('collections', function() {
    test('validateDocument() fail', async function() {
      let err;
      try {
        await connection.repository.validateDocument({});
      } catch (e) {
        err = e;
      }
      assert(err);
    });

    test('validateDocument() pass', async function() {
      await connection.repository.validateDocument({
        id: 'wootbar',
        url: 'http://github.com'
      });
    });

    suite('CRUD', function() {
      setup(async function() {
        await connection.repository.create({
          id: 'wootbar22',
          url: 'baz'
        });
      });

      teardown(async function() {
        await connection.repository.findOneAndRemove({ id: 'wootbar22' });
      });

      test('findOne', async function() {
        let result = await connection.repository.findOne({
          id: 'wootbar22'
        });

        assert.equal(result.id, 'wootbar22');
        assert.equal(result.url, 'baz');
      });

      test('update', async function() {
        let doc = await connection.repository.findOne({ id: 'wootbar22' });
        doc.url = 'xfoobar';
        await connection.repository.update({ id: 'wootbar22' }, { url: 'xfoobar' });

        let docUpdate = await connection.repository.findOne({ id: 'wootbar22' });
        assert.equal(docUpdate.url, doc.url);
        assert.equal(docUpdate._self, doc._self);
        assert.notEqual(doc._etag, docUpdate._etag);
      });
    });
  });

});
