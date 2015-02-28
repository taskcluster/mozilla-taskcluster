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

  suite('with install', () => {
    let subject;
    let fixturePwd = fsPath.join(__dirname, 'fixtures', 'compose');
    suiteSetup(async function() {
      subject = await install();
    });

    test('run() / destroy()', async () => {
      let service = await subject.run(fixturePwd, 'sleep');
      let state = await subject.inspect(service);

      assert.ok(state.State.Running, 'service is running');
      let port = await subject.portById(service, 8000);
      assert.ok(port, 'port number is available');

      await subject.destroy(service);

      try {
        await subject.inspect(service);
      } catch (e) {
        assert.ok(e, 'given an error');
        assert.equal(e.statusCode, 404);
        return;
      }

      throw new Error('No error thrown during inspect');
    });

    test('up / killAll / ps', async () => {
      await subject.up(fixturePwd);
      let containers = await subject.ps(fixturePwd);
      assert.equal(containers.length, 1);

      let state = await subject.inspect(containers[0])
      assert.equal(state.Args[1], 'sleep infinity', 'is using right container');

      await subject.killAll(fixturePwd);

      let killedState = await subject.inspect(containers[0]);
      assert.equal(killedState.State.Running, false);

      await subject.up(fixturePwd);
      let runningState = await subject.inspect(containers[0]);
      assert.equal(runningState.State.Running, true);
    });
  });
});
