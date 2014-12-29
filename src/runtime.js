import * as docdb from 'documentdb';
import { Connection } from './db';
import Kue from 'kue';

import Repos from './collections/repositories';

export default async function(config) {
  let db = new Connection(
    config.documentdb.database,
    config.documentdb.host,
    { masterKey: config.documentdb.key }
  );

  let kue = Kue.createQueue({
    prefix: config.kue.prefix,
    redis: config.redis
  });

  return {
    db,
    kue,
    repositories: new Repos(db)
  };
}
