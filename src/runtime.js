import * as docdb from 'documentdb';
import { Connection } from './db';
import Kue from 'kue';
import publisher from './publisher';

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
    commitPublisher: await publisher(config.commitPublisher),
    repositories: new Repos(db)
  };
}
