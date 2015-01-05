#! /usr/bin/env node

/**
Starts kue admin interface.
*/

import '6to5/polyfill';
import cli from '../cli';
import kue from 'kue';

cli(async function main(runtime, config) {
  kue.app.listen(config.kue.admin.port, function() {
    console.log(`started kue admin on port ${config.kue.admin.port}`);
  });
});
