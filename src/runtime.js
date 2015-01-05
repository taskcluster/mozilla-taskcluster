import * as docdb from 'documentdb';
import { Connection } from './db';
import kue from 'kue';

import Repos from './collections/repositories';

export default async function(config) {
  let db = new Connection(
    config.documentdb.database,
    config.documentdb.host,
    { masterKey: config.documentdb.key }
  );

  let jobs = kue.createQueue({
    prefix: config.kue.prefix,
    redis: config.redis
  });


  return {
    db,
    kue,
    jobs,
    repositories: new Repos(db)
  };
}
