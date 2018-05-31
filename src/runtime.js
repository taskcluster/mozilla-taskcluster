import url from 'url';
import createConnection from './db';
import kue from 'kue';

import Repos from './collections/repositories';
import PushlogClient from './pushlog/client';

export default async function(config) {
  let redisUrl = url.parse(process.env.REDIS_URL);
  let password = redisUrl.auth.split(':')[1];

  let db = await createConnection(config.mongo.connectionString);
  let jobs = kue.createQueue({
    prefix: config.kue.prefix,
    redis: {
      port: parseInt(redisUrl.port, 10),
      host: redisUrl.hostname,
      options: {
        auth_pass: password, // I'm not sure why, but this is the format from mongo
      },
    },
  });

  return {
    db,
    kue,
    jobs,
    pushlog: new PushlogClient(),
    repositories: await Repos.create(db)
  };
}
