#! /usr/bin/env node

/**
Treeherder proxy http endpoint....
*/

import '6to5/polyfill';
import cli from '../cli';
import createServer from '../server';
import denodeify from 'denodeify';

import Good from 'good';
import GoodConsole from 'good-console';

cli(async function main(runtime, config) {
  let server = await createServer(runtime, config);

  // Log all events to the console...
  await denodeify(server.register).call(server, {
    register: Good,
    options: {
      reporters: [{
        reporter: GoodConsole,
        args: [ { log: '*', response: '*' } ]
      }]
    }
  });

  await denodeify(server.start).call(server);
  console.log(server.match('GET', '/'), '<<!');
  console.log('server running...', config.treeherderProxy);
});
