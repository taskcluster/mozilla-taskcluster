import {
  default as createConnection,
  Collection
} from '../src/db';

import uuid from 'uuid';
import assert from 'assert';

let Joi = require('joi');

suite('db', function() {
  class Data extends Collection {
    get indexes() {
      return {
        id: {
          w: 'majority',
          unique: true
        }
      };
    }

    get id() {
      return 'data';
    }

    get schema() {
      return Joi.object().keys({
        id: Joi.string().min(1).required(),
        url: Joi.string().required(),
      }).unknown(true);
    }
  }

  let connection, db = uuid.v4(), client, data;
  suiteSetup(async function() {
    connection = await createConnection(this.config.mongo.connectionString);
    data = await Data.create(connection);
  });

  suiteTeardown(async function() {
    await connection.dropDatabase();
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

      test('index uniqueness', async function() {
        try {
          await data.create({
            id: id,
            url: 'baz'
          });
        } catch (e) {
          assert.ok(e.message.indexOf('duplicate') !== -1);
          return e;
        }
        throw new Error('Should throw uniqueness error...');
      });

      test('#createIfNotExists', async function() {
        await data.createIfNotExists({
          id: 'magicbar',
          url: 'value'
        });

        let found = await data.findById('magicbar');
        assert.equal(found.url, 'value');

        await data.createIfNotExists({
          id: 'magicbar',
          url: 'zomgwhat'
        });

        // Value should not have been updated...
        let found2 = await data.findById('magicbar');
        assert.equal(found2.url, 'value');
      });

      test('#findById', async function() {
        let result = await data.findById(id);
        assert.equal(result.id, id);
        assert.equal(result.url, 'baz');
      });

      test('#remove', async function() {
        // Attempt to remove something that does not exist...
        assert.equal(await data.remove('thefoo'), 0);

        await data.create({
          id: 'thefoo',
          url: 'baz'
        });

        // Remove something that does...
        assert.equal(await data.remove('thefoo'), 1);
      });

      test('#replace', async function() {
        let newDoc = await data.findById(id);
        newDoc.url = 'new';
        await data.replace({ id }, newDoc);

        let doc = await data.findById(id);
        assert.equal(doc.url, 'new');

        try {
          await data.replace({ id, url: 'old' }, {
            id,
            url: 'TEH FOO'
          });
        } catch (e) {
          // Did not find anything to update...
          assert.ok(e);
          assert.equal(e.result.value, null);
          return e;
        }
        throw new Error('Should have thrown...');
      });
    });
  });
});
