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
  'findById',
  'findAndRemove',
  'findOneAndRemove',
  'findAndModify',
  'findOneAndModify',
  'findOrCreate',
  'update'
];

export class Collection {
  constructor(client) {
    this.client = client;
    for (let proxy of COLLECTION_PROXY) {
      if (this[proxy]) continue;
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
    let id = col.prototype.id;
    con[id] = new col(doqclient.use(id));
  }
  return con;
}
