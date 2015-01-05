import * as docdb from 'documentdb';
import { Connection } from './db';
import kue from 'kue';
import publisher from './publisher';

import Repos from './collections/repositories';
import PushExchange from './exchanges/push';

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

  let commitPublisher = await publisher(config.commitPublisher);
  await commitPublisher.assertExchanges(
    PushExchange
  );

  return {
    db,
    kue,
    jobs,
    commitPublisher,
    repositories: new Repos(db)
  };
}
