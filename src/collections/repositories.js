import { Collection } from '../db';
import { createHash } from 'crypto';
let Joi = require('joi');

/**
The repositories collection contains the list of all repositories which should
be synchronized by the proxy.
*/
export default class Repositories extends Collection {
  static hashUrl(url) {
    return createHash('md5').update(url).digest('hex');
  }

  get id() {
    return 'repositories';
  }

  get schema() {
    return Joi.object().keys({
      id: Joi.string(),

      alias: Joi.string().required().
        description('Alias used by treeherder'),

      url: Joi.string().required(),

      lastChangset: Joi.string().
        description('Last changeset in most recent push'),

      lastPushId: Joi.number().integer().default(0).min(0).
        description('Push log id')
    }).unknown(true)
  }

  async validateDocument(doc) {
    // Await + super don't seem to play nice hack around it!
    let v = super.validateDocument(doc);
    doc = await v;
    doc.id = Repositories.hashUrl(doc.url);
    return doc;
  }
}
