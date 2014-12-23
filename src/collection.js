import * as Joi from 'joi';
import assert from 'assert';
import denodeify from 'denodeify';

let validate = denodeify(Joi.validate.bind(Joi));

/**
Purely an experiment in building documentdb models.
*/
class Collection {
  constructor(name) {
    this.name = name;
  }

  schema(joi) {
    this.schema = joi;
    return this;
  }

  async validate(input) {
    if (!this.schema) return input;
    return await validate(input, this.schema);
  }
}

class Connection {
  constructor(resource, client) {
    this.resource = resource;
    this.client = client;
  }

  async destroy() {
    return await this.client.deleteDatabaseAsync(this.resource._self);
  }

  create() {
  }
}

export async function connect(client, database, collections) {
  let db;
  try {
    db = await client.createDatabaseAsync({ id: database });
  } catch (e) {
    console.log(e);
  }
  return new Connection(db.resource, client);
}

export function define(name) {
  Joi.assert(name, Joi.string().min(1));
  return new Collection(name);
}
