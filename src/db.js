import assert from 'assert';
import { MongoClient } from 'mongodb';
import ppo from 'proxied-promise-object';
import denodeify from 'denodeify';
import Debug from 'debug';
import Joi from 'joi';

const debug = Debug('taskcluster-proxy:db');
const mongo = ppo(MongoClient);

export class Collection {
  static async create(db) {
    // Ensure index and collection are ready first...
    let id = this.prototype.id;
    let schema = this.prototype.schema;
    let indexes = this.prototype.indexes;

    assert(id, 'Must define .id');
    assert(schema, 'Must define schema');

    debug('Initialize collection', id);
    let collection = ppo(await db.collection(id));

    if (indexes) {
      for (let field in indexes) {
        debug('creating index', field, indexes[field]);
        await collection.createIndex(field, indexes[field]);
      }
    }

    return new this(collection);
  }

  get indexes() {
    return {
      id: {
        w: 'majority',
        unique: true
      }
    }
  }

  constructor(collection) {
    this.collection = collection;
  }

  async validateDocument(doc) {
    let res = Joi.validate(doc, this.schema);
    if (res.error) throw res.error;
    return res.value;
  }

  async findOne(...args) {
    return await this.collection.findOne(...args);
  }

  async findById(id) {
    return await this.findOne({ id });
  }

  async create(doc) {
    doc = await this.validateDocument(doc);
    let { ops } = await this.collection.insert(doc);
    return ops[0];
  }

  async createIfNotExists(doc) {
    doc = await this.validateDocument(doc);
    return await this.collection.findOneAndUpdate(
      { id: doc.id },
      {
        upsert: true,
        $setOnInsert: doc
      }
    );
  }

  async replace(query, doc) {
    doc = await this.validateDocument(doc);
    let result = await this.collection.findOneAndReplace(
      query,
      doc
    );

    // If we successfully replaced the object return it
    if (result.value) return result.value;

    let err = new Error('Could not find or replace document');
    err.result = result;
    throw err;
  }

  async find(query = {}) {
    // XXX: Terrible hack around the fact that ppo is not smart enough to
    // know that find does not return a promise...
    let find = await this.collection.subject.find(query)
    return await denodeify(find.toArray).call(find);
  }

  async remove(id) {
    Joi.assert(id, Joi.string(), 'must provide string');
    let { deletedCount } = await this.collection.deleteOne({
      id
    });
    return deletedCount;
  }
}

export default async function createConnection(connectionString) {
  return ppo(await mongo.connect(connectionString))
}
