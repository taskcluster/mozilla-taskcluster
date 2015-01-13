import * as docdb from 'documentdb';
import { Connection } from './db';
import kue from 'kue';

import Repos from './collections/repositories';
import PushlogClient from './repository_monitor/pushlog_client';

export default async function(config) {
  let db = new Connection(config.documentdb);
  let jobs = kue.createQueue({
    prefix: config.kue.prefix,
    redis: config.redis
  });

  return {
    db,
    kue,
    jobs,
    pushlog: new PushlogClient(),
    repositories: new Repos(db)
  };
}
