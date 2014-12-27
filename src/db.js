import * as Joi from 'joi';
import assert from 'assert';
import denodeify from 'denodeify';
import * as docdb from 'documentdb-q-promises';
import Debug from 'debug';

let debug = Debug('taskcluster-proxy:db');
let validate = denodeify(Joi.validate.bind(Joi));

function sleep(n) {
  return new Promise((accept) => {
    setTimeout(accept, n);
  });
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
    return await validate(doc, this.schema);
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
    return await this.client.createDocumentAsync(
      link,
      doc,
      opts
    );
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
  async update(id, asyncHandler) {
    Joi.assert(id, Joi.string(), 'document id must be passed...');

    let maxTries = 5;
    let currentTry = 0;
    let wait = 0;
    let interval = 100;

    debug('initialize update', id);
    while (++currentTry <= maxTries) {
      let doc = await this.findById(id);
      let updated = await asyncHandler(doc);
      // Allow the handler to abort the update for any reason...
      if (!updated) {
        debug('aborting update', id);
        return false;
      }
      try {
        debug('issue update...', id);
        return await this.client.replaceDocumentAsync(doc._self, updated, {
          accessCondition: {
            type: 'IfMatch',
            condition: doc._etag
          }
        });
      } catch (e) {
        // Only handle 412 the precondition handler which checks etags.
        if (e.error.code !== 412) {
          debug('Error handling update', id, e);
          throw e;
        }
        debug(`Sleeping ${interval} after failure updating ${id}`);
        await sleep(interval);
        interval = (currentTry * interval) + interval;
        debug('Failed update new interval', id, interval);
      }
    }
    throw new Error(
      `Failed to update ${id} after maximum attempts...`
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
  constructor(database, host, options={}) {
    Joi.assert(options, Joi.object().keys({
      masterKey: Joi.string().required()
    }));
    Joi.assert(host, Joi.string());

    this.id = database;
    this.host = host;

    this.client = new docdb.DocumentClientWrapper(host, options);
    this.links = { database: null, collections: {} };
  }

  async destroy(opts={}) {
    let link = await this.ensureDatabase();
    return this.client.deleteDatabaseAsync(link, opts);
  }

  async ensureDatabase() {
    if (this.links.database) {
      return this.links.database;
    }

    let db = await this.client.queryDatabases(
      `SELECT * FROM root WHERE root.id = "${this.id}"`
    ).toArrayAsync();

    if (db.feed.length) {
      return this.links.database = db.feed[0]._self;
    }

    let db = await this.client.createDatabaseAsync({
      id: this.id
    });

    return this.links.database = db.resource._self;
  }

  async ensureCollection(id) {
    if (this.links.collections[id]) {
      return this.links.collections[id];
    }

    let dbLink = await this.ensureDatabase();
    let collection = await this.client.queryCollections(
      dbLink,
      `SELECT * FROM root WHERE root.id = "${id}"`
    ).toArrayAsync();

    if (collection.feed[0]) {
      return this.links.collection[id] = collection.feed[0]._self;
    }

    let collection = await this.client.createCollectionAsync(
      dbLink,
      { id: id }
    );
    return this.links.collections[id] = collection.resource._self;
  }
}
