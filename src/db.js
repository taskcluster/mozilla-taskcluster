import assert from 'assert';
import docdb from 'documentdb-q-promises';
import Debug from 'debug';

let Joi = require('joi');
let debug = Debug('taskcluster-proxy:db');

function sleep(n) {
  return new Promise((accept) => {
    setTimeout(accept, n);
  });
}

function lock(name, fn, ctx) {
  name = `__lock__${name}`;
  // Helper to ensure only one instance of a async function is running per
  // object at a given time...
  let clear = () => {
    delete ctx[name];
  };

  if (ctx[name]) {
    return ctx[name];
  }

  ctx[name] = fn.call(ctx);
  if (!ctx[name].then) {
    throw new Error('not a promise');
  }
  return ctx[name].then((res) => {
    clear();
    return res;
  }).catch((e) => {
    clear();
    throw e;
  })
}

export class Collection {
  constructor(connection) {
    Joi.assert(connection, Joi.object().type(Connection));
    Joi.assert(this.name, Joi.string(), 'Subclass must set name');
    Joi.assert(this.schema, Joi.object(), 'Subclass must set schema');

    this.con = connection;
    this.client = connection.client;

    this._links = { db: null, collection: null };
  }

  async validateDocument(doc) {
    let res = Joi.validate(doc, this.schema);
    if (res.error) throw res.error;
    return res.value;
  }

  async findById(id, opts={}) {
    let results = await this.query(
      `SELECT * FROM r WHERE r.id = "${id}"`
    );
    return results.feed[0];
  }

  async create(doc, opts={}) {
    let link = await this.con.ensureCollection(this.id);

    doc = await this.validateDocument(doc);
    let res = await this.client.createDocumentAsync(
      link,
      doc,
      opts
    );
    return res.resource;
  }

  async createIfNotExists(doc) {
    doc = await this.validateDocument(doc);

    let found = await this.findById(doc.id);
    if (found) return found;
    return await this.create(doc);
  }

  /**
  Update an existing document using etags to ensure we update the document in a
  known state.

  ```js
  collection.update(id, async function(doc) {
    // If the document is returned then a replace will be attempted if null is
    // returned the update will be aborted...
    doc.field = value;
    return doc;
  });
  ```
  */
  async update(idOrDoc, asyncHandler) {
    let maxTries = 5;
    let currentTry = 0;
    let wait = 0;
    let interval = 100;

    debug('initialize update', idOrDoc);
    while (++currentTry <= maxTries) {
      let doc;
      // If this is the first attempt then we can try to use an existing object
      // prior to fetching one from the database saving us a call...
      if (currentTry === 1 && typeof idOrDoc === 'object') {
        doc = idOrDoc;
        idOrDoc = idOrDoc.id;
      }
      if (!doc) doc = await this.findById(idOrDoc);

      let updated = await asyncHandler(doc);
      updated = await this.validateDocument(updated);
      // Allow the handler to abort the update for any reason...
      if (!updated) {
        debug('aborting update', idOrDoc);
        return false;
      }
      try {
        debug('issue update...', idOrDoc);
        let result = await this.client.replaceDocumentAsync(doc._self, updated, {
          accessCondition: {
            type: 'IfMatch',
            condition: doc._etag
          }
        });
        return result.resource;
      } catch (e) {
        // Only handle 412 the precondition handler which checks etags.
        if (!e.error || e.error.code !== 412) {
          debug('Error handling update', idOrDoc, e);
          throw e;
        }
        debug(`Sleeping ${interval} after failure updating ${idOrDoc}`);
        await sleep(interval);
        interval = (currentTry * interval) + interval;
        debug('Failed update new interval', idOrDoc, interval);
      }
    }
    throw new Error(
      `Failed to update ${idOrDoc} after maximum attempts...`
    );
  }

  async query(sql, opts={}) {
    Joi.assert(sql, Joi.string(), 'must pass sql string');
    let link = await this.con.ensureCollection(this.id);
    return await this.client.queryDocuments(link, sql, opts).toArrayAsync();
  }

  async remove(id) {
    Joi.assert(id, Joi.string(), 'must provide string');
    let doc = await this.findById(id);
    if (!doc) return;
    return await this.client.deleteDocumentAsync(doc._self);
  }
}

export class Connection {
  /**
  Create a connection to documentdb...
  */
  constructor(options={}) {
    let opts = Object.assign(
      {
        host: process.env.DOCUMENTDB_HOST,
        key: process.env.DOCUMENTDB_KEY
      },
      options
    );

    Joi.assert(opts, Joi.object().keys({
      database: Joi.string().required(),
      host: Joi.string().required(),
      key: Joi.string().required()
    }));

    this.id = opts.database;
    this.host = opts.host;

    this.client = new docdb.DocumentClientWrapper(this.host, {
      masterKey: opts.key
    });
    this.links = { database: null, collections: {} };
  }

  async destroy(opts={}) {
    let link = await this.ensureDatabase();
    return this.client.deleteDatabaseAsync(link, opts);
  }

  async ensureDatabase() {
    return await lock('ensureDatabase', async function() {
      if (this.links.database) {
        return this.links.database;
      }

      let db;
      db = await this.client.queryDatabases(
        `SELECT * FROM root WHERE root.id = "${this.id}"`
      ).toArrayAsync();

      if (db.feed.length) {
        return this.links.database = db.feed[0]._self;
      }

      db = await this.client.createDatabaseAsync({
        id: this.id
      });

      return this.links.database = db.resource._self;
    }, this);
  }

  async ensureCollection(id) {
    return await lock(`ensureCollection ${id}`, async function() {
      if (this.links.collections[id]) {
        return this.links.collections[id];
      }

      let dbLink = await this.ensureDatabase();
      let collection;
      collection = await this.client.queryCollections(
        dbLink,
        `SELECT * FROM root WHERE root.id = "${id}"`
      ).toArrayAsync();

      if (collection.feed[0]) {
        this.links.collections[id] = collection.feed[0]._self;
        return this.links.collections[id];
      }

      collection = await this.client.createCollectionAsync(
        dbLink,
        { id: id }
      );
      return this.links.collections[id] = collection.resource._self;
    }, this);
  }
}
