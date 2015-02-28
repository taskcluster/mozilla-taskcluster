import os from 'os';
import fs from 'mz/fs';
import { exec } from 'mz/child_process';
import request from 'superagent';
import fsPath from 'path';
import eventToPromise from 'event-to-promise';

import dockerOpts from 'dockerode-options';
import Docker from 'dockerode-promise'
import Debug from 'debug';

const debug = Debug('compose');

// Compose binary name...
export const COMPOSE_VERSION = '1.1.0';
const COMPOSE_BASE_URL = 'https://github.com/docker/compose/releases/download';
const COMPOSE_INSTALL_ROOT = fsPath.join(__dirname, '.compose');

function composeLocationConfig() {
  // urls are formatted as Darwin/Linux/etc..
  let platform = os.platform();
  platform = `${platform[0].toUpperCase()}${platform.slice(1)}`

  let arch;
  switch (os.arch()) {
    case 'x64':
      arch = 'x86_64';
      break;
    default:
      arch = os.arch();
  }

  let url = `${COMPOSE_BASE_URL}/${COMPOSE_VERSION}/docker-compose-${platform}-${arch}`;
  let slug = `${COMPOSE_VERSION}-${platform}-${arch}`;
  return { url, slug };
}

/**
Docker compose related utilities...
*/

class Compose {
  constructor(composeBin) {
    this.bin = composeBin;
    this.docker = new Docker(dockerOpts());
  }

  async version() {
    let [version] = await exec(`${this.bin} --version`);
    let [, number] = version.trim().split(' ');
    return number;
  }
}

/**
Download and install docker-compose.

@param {String} [installPath] install path for compose binaries.
*/
export async function install(installPath = COMPOSE_INSTALL_ROOT) {
  let { url, slug } = composeLocationConfig();
  debug('compose install', { url, slug });

  // Ensure compose install root exists...
  if (!await fs.exists(installPath)) {
    await fs.mkdir(installPath);
  }

  let composeBin = fsPath.join(installPath, slug);

  // Check for an existing install ..
  if (await fs.exists(composeBin)) {
    debug('compose already installed...');
    return new Compose(composeBin);
  }

  debug('fetching compose')
  let stream = fs.createWriteStream(composeBin);
  let req = request.get(url).redirects(5);
  req.pipe(stream);

  // Wait until the binary is downloaded...
  await eventToPromise(stream, 'finish');
  await fs.chmod(composeBin, '0774');
  return new Compose(composeBin);
}
