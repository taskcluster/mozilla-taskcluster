import _waitForPort from 'wait-for-port';
import temp from 'promised-temp';
import denodeify from 'denodeify';
import fsPath from 'path';
import fs from 'mz/fs';
import { exec } from 'mz/child_process';
import Debug from 'debug';

// Name of the hg/pushlog service in docker-compose.yml
const SERVICE = 'pushlog';
const COMPOSE_DIR = __dirname;
const LOG_TEMPLATE = '{node} {author} {desc}\n';

const debug = Debug('hg');
const waitForPort = denodeify(_waitForPort);

class Hg {
  constructor(compose, containerId, url, path) {
    this.path = path;
    this.compose = compose;
    this.containerId = containerId;
    this.url = url;
  }

  async write(path, content='') {
    debug('write', path);
    await fs.writeFile(fsPath.join(this.path, path), content);
  }

  async log() {
    let [stdout] = await exec(`hg log --template "${LOG_TEMPLATE}"`, {
      cwd: this.path
    });

    return stdout.trim().split('\n').map((v) => {
      let [node, user, desc] = v.split(' ');
      return { node, user, desc };
    });
  }

  async push() {
    debug('push');
    await exec(`hg push ${this.url}`, { cwd: this.path });
  }

  async commit(message='commit', user='user@example.com') {
    debug('commit', message, user);
    return exec(`hg commit -u "${user}" -A -m "${message}"`, {
      cwd: this.path
    });
  }

  async destroy() {
    await exec(`rm -Rf ${this.path}`);
    await this.compose.destroy(this.containerId);
  }
}

export default async function(compose) {
  // Verify we have hg installed...
  try {
    await exec('which hg');
  } catch (e) {
    throw new Error(`
      These tests require hg to be installed on the host!
    `);
  }

  // First create an instance of the pushlog...
  let containerId = await compose.run(COMPOSE_DIR, SERVICE);
  let port = await compose.portById(containerId, 8000);
  let url = `http://${compose.host}:${port}`

  // Wait for the port to actually be available...
  await waitForPort(compose.host, port, {
    numRetries: 2000,
    retryInterval: 100
  });

  let path = temp.path();
  await exec(`hg clone ${url} ${path}`);
  return new Hg(compose, containerId, url, path);
}
