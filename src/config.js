import { Provider } from 'nconf';
import path from 'path';
import fs from 'mz/fs';
import denodeify from 'denodeify';
import * as Joi from 'joi';

// Schema used to ensure we have all the correct configuration values prior to
// running any more complex logic...
let schema = Joi.object().keys({
  documentdb: Joi.object().keys({
    host: Joi.string().required().description('documentdb hostname'),
    key: Joi.string().required().description('master or secondary read/write key'),
    database: Joi.string().required().description('database name')
  }),

  treeherder: Joi.object().keys({
    apiUrl: Joi.string().required()
  })

}).unknown(true);

export default async function load(file) {
  // Fallback to one of our preconfiged files...
  if (!await fs.exists(file)) {
    file = path.join(__dirname, 'config', file);
  }

  let conf = new Provider().
    file(path.join(process.cwd(), 'treeherder-proxy.json')).
    defaults(require('./config/default')).
    overrides(require(file));


  let initial = await denodeify(conf.load.bind(conf))();
  return await denodeify(Joi.validate.bind(Joi))(
    initial,
    schema
  );
};
