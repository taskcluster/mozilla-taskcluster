import * as Joi from 'joi';
import assert from 'assert';
import denodeify from 'denodeify';
import Doq from 'doqmentdb';

let validate = denodeify(Joi.validate.bind(Joi));

const COLLECTION_PROXY = [
  'insert',
  'getCollection',
  'find',
  'findOne',
  'findAndRemove',
  'findOneAndRemove',
  'findAndModify',
  'findOneAndModify',
  'findOrCreate',
  'update'
];

class Collection {
  constructor(options) {
    Joi.assert(options, Joi.object().unknown(false).keys({
      client: Joi.object().required().description('doq client'),
      schema: Joi.object().required().description('joi schema'),
      id: Joi.string().required().description('id of the collection')
    }), `Collection ${options.id || 'unknown collection'}`);
    Object.assign(this, options);

    for (let proxy of COLLECTION_PROXY) {
      this[proxy] = this.client[proxy].bind(this.client);
    }
  }

  async validateDocument(doc) {
    return await validate(doc, this.schema);
  }

  async create(doc) {
    doc = await this.validateDocument(doc);
    return await this.client.insert(doc);
  }
}

/**
Purely an experiment in building documentdb models.
*/
class CollectionBuilder {
  constructor(id) {
    this.id = id ;
  }

  schema(joi) {
    this.schema = joi;
    return this;
  }
}

class Connection {
  constructor(doq, client, database) {
    this.doq = doq;
    this.client = client;
    this.database = database;
  }

  async destroy() {
    let db = await this.doq.getDatabase();
    let deleteDb = denodeify(this.client.deleteDatabase.bind(this.client));
    return await deleteDb(db._self);
  }
}

/**
Initialize the connections optionally creating collections.
*/
export async function connect(client, database, collections) {
  let doqclient = new Doq(client, database);
  let con = new Connection(doqclient, client, database);
  for (let col of collections) {
    con[col.id] = new Collection({
      id: col.id,
      schema: col.schema,
      client: doqclient.use(col.id)
    });
  }

  return con;
}

export function define(id) {
  Joi.assert(id, Joi.string().min(1));
  return new CollectionBuilder(id);
}
