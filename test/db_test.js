import * as subject from '../src/db';
import * as Joi from 'joi';
import docdb from 'documentdb-q-promises';

import uuid from 'uuid';
import assert from 'assert';

suite('db', function() {
  class Data extends subject.Collection {
    get id() {
      return 'data';
    }

    get schema() {
      return Joi.object().keys({
        id: Joi.string().min(1).required(),
        url: Joi.string().required(),
      });
    }
  }

  let connection, db = uuid.v4(), client, data;
  suiteSetup(function() {
    client = new docdb.DocumentClientWrapper(
      this.config.documentdb.host,
      { masterKey: this.config.documentdb.key }
    );

    connection = new subject.Connection(
      db,
      this.config.documentdb.host,
      { masterKey: this.config.documentdb.key }
    );

    data = new Data(connection);
  });

  suiteTeardown(async function() {
    await connection.destroy();
  });

  suite('collections', function() {
    test('validateDocument() fail', async function() {
      let err;
      try {
        await data.validateDocument({});
      } catch (e) {
        err = e;
      }
      assert(err);
    });

    test('validateDocument() pass', async function() {
      await data.validateDocument({
        id: 'wootbar',
        url: 'http://github.com'
      });
    });

    suite('CRUD', function() {
      let id = 'wootbar';
      setup(async function() {
        await data.create({
          id: id,
          url: 'baz'
        });
      });

      teardown(async function() {
        await data.remove(id);
      });

      test('#findById', async function() {
        let result = await data.findById(id);
        assert.equal(result.id, id);
        assert.equal(result.url, 'baz');
      });

      test('update - no conflict', async function() {
        let result = await data.update(id, async function(doc) {
          doc.url = 'new';
          return doc;
        });

        let doc = await data.findById(id);
        assert.equal(doc.url, 'new');
        assert.equal(doc._etag, result.resource._etag);
      });

      test('update - conflict', async function() {
        let currentTry = 0;
        let result = await data.update(id, async function(doc) {
          doc.url = 'new';
          if (currentTry++ < 3) {
            await client.replaceDocumentAsync(doc._self, doc);
          }
          return doc;
        });

        let doc = await data.findById(id);
        assert.equal(currentTry, 4, 'ran for 4 tries');
        assert.equal(doc.url, 'new');
        assert.equal(doc._etag, result.resource._etag);
      });
    });
  });
});
