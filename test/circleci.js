#! /usr/bin/env node

// helper script for generating configs needed for circle ci tests...
var fs = require('fs');
var assert = require('assert');
var yaml = require('js-yaml');

// We depend on a number of environment variables which circle ci injects.
assert(process.env.PULSE_USERNAME, 'has env.PULSE_USERNAME');
assert(process.env.PULSE_PASSWORD, 'has env.PULSE_PASSWORD');

assert(process.env.DOCUMENTDB_KEY, 'has env.DOCUMENTDB_KEY');
assert(process.env.DOCUMENTDB_HOST, 'has env.DOCUMENTDB_HOST');

var config = {
  documentdb: {
    host: process.env.DOCUMENTDB_HOST,
    key: process.env.DOCUMENTDB_KEY
  },

  treeherderTaskcluster: {
    connectionString: 'amqps://' + process.env.PULSE_USERNAME + ':' +
                      process.env.PULSE_PASSWORD + '@pulse.mozilla.org:5671'
  }
};

fs.writeFileSync(
  __dirname + '/../test-treeherder-proxy.yml', yaml.safeDump(config)
);
