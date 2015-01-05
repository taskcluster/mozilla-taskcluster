#! /usr/bin/env node
/**
Works the "kue" for pushes and emits amqp events.
*/

import '6to5/polyfill';
import cli from '../cli';
import publisher from '../publisher';

import Monitor from '../repository_monitor/monitor';
import PushExchange from '../exchanges/push';

// Time allowed for running jobs to complete before killing...
const KUE_SHUTDOWN_GRACE = 5000;

function work(fn) {
  return function(value, done) {
    fn(value)
      .then((...args) => {
        done(null, ...args);
      })
      .catch(done);
  }
}

cli(async function main(runtime, config) {
  let commitPublisher = await publisher(config.commitPublisher);
  await commitPublisher.assertExchanges(
    PushExchange
  );

  // graceful shutdown
  process.once('SIGTERM', () => {
    runtime.jobs.shutdown((err) => {
      if (err) {
        console.error(err)
      }
      process.exit(0);
    }, KUE_SHUTDOWN_GRACE);
  });

  // Start interval promotion (should only run one of these)...
  runtime.jobs.promote();

  // Process the incoming pushes....
  runtime.jobs.process('push', 100, work(async function(task) {
    let data = task.data;
    let message = {
      id: data.push.id,
      url: data.repo.url,
      alias: data.repo.alias,
      date: new Date(data.push.date * 1000).toJSON(),
      user: data.push.user,
      changesets: data.push.changesets.map((cset) => {
        return {
          author: cset.author,
          branch: cset.branch,
          description: cset.desc,
          files: cset.files,
          node: cset.node,
          tags: cset.tags
        }
      })
    };

    let routingKeys = {
      alias: data.repo.alias
    };

    await commitPublisher.publish(
      PushExchange,
      routingKeys,
      message
    );
  }));
});
