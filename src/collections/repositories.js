import { define } from '../collection';
import * as Joi from 'joi';

/**
The repositories collection contains the list of all repositories which should
be synchronized by the proxy.
*/
export default define('repositories').
  schema(Joi.object().keys({
    alias: Joi.string().required().
      description('Alias used by treeherder'),

    url: Joi.string().required().regex(/^https\:\/\/hg\.mozilla.org/).
      description('Mozilla hg url'),

    lastPushId: Joi.number().integer().default(0).min(0).required().
      description('Push log id')
  }))
