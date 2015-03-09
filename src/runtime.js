import createConnection from './db';
import kue from 'kue';

import Repos from './collections/repositories';
import PushlogClient from './pushlog/client';

export default async function(config) {

  let db = await createConnection(config.mongo.connectionString);
  let jobs = kue.createQueue({
    prefix: config.kue.prefix,
    redis: config.redis
  });

  return {
    db,
    kue,
    jobs,
    pushlog: new PushlogClient(),
    repositories: await Repos.create(db)
  };
}
