import assert from 'assert';
import fsPath from 'path';
import { exec } from 'mz/child_process';

import {
  install,
  COMPOSE_VERSION
} from './compose';

suite('compose', function() {
  suite('install', function() {
    let fixtures = fsPath.join(__dirname, '.compose-fixture');

    async function cleanup() {
      await exec(`rm -Rf ${fixtures}`);
    }

    setup(cleanup);
    teardown(cleanup);

    test('successful install', async function() {
      async function verify() {
        let compose = await install(fixtures);
        let version = await compose.version();
        assert.equal(version, COMPOSE_VERSION);
      }

      // Ensure this pases the first time...
      await verify()
      // Ensure it is idempotent...
      await verify();
    });
  });

});
