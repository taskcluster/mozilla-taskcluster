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

  suite('life cycle', () => {
    let subject;
    let fixturePwd = fsPath.join(__dirname, 'fixtures', 'compose');
    setup(async function() {
      subject = await install();
    });

    test('up / kill / ps', async () => {
      await subject.up(fixturePwd);
      let containers = await subject.ps(fixturePwd);
      assert.equal(containers.length, 1);

      let state = await subject.inspect(containers[0])
      assert.equal(state.Args[1], 'sleep infinity', 'is using right container');

      await subject.kill(fixturePwd);

      let killedState = await subject.inspect(containers[0]);
      assert.equal(killedState.State.Running, false);

      await subject.up(fixturePwd);
      let runningState = await subject.inspect(containers[0]);
      assert.equal(runningState.State.Running, true);
    });
  });
});
