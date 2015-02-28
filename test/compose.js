import os from 'os';
import fs from 'mz/fs';
import URL from 'url';
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
    let dockerConf = dockerOpts();
    // Use remote host if given otherwise assume localhost...
    this.host = dockerConf.host || 'localhost';
    this.bin = composeBin;
    this.docker = new Docker(dockerConf);
  }

  /**
  Bring a docker-compose yaml stack online...
  */
  async up(cwd) {
    return exec(`${this.bin} up -d --no-recreate`, { cwd });
  }

  async killAll(cwd) {
    return exec(`${this.bin} kill`, { cwd });
  }

  /**
  Start running a single instance of a given service.
  */
  async run(cwd, service) {
    let [service] = await exec(`${this.bin} run -d --service-ports ${service}`, {
      cwd
    });

    return service.trim();
  }

  async portByName(cwd, service, port) {
    let [result] = await exec(`${this.bin} port ${service} ${port}`, {
      cwd
    });

    let [host, port] = host.trim().split(':');
    if (port) {
      return parseInt(port, 10);
    }
    throw new Error(`Unknown port ${port} for service ${service}`);
  }

  async portById(containerId, port) {
    let inspect = await this.inspect(containerId);
    let ports = inspect.NetworkSettings.Ports;
    let port = ports[`${port}/tcp`];

    if (!port) {
      throw new Error(`Unknown port ${port} for container ${containerId}`);
    }
    return parseInt(port[0].HostPort, 10);
  }

  /**
  Ensure container is both killed and removed.
  */
  async destroy(containerId) {
    let container = this.docker.getContainer(containerId);
    await container.kill({});
    await container.remove({});
  }

  async ps(cwd) {
    let [stdout] = await exec(`${this.bin} ps -q`, {
      cwd
    });

    return stdout.trim().split('\n').map((v) => {
      return v.trim();
    });
  }

  /**
  Inspect a container given it's container id (note you can get this via ps)
  */
  async inspect(containerId) {
    let container = this.docker.getContainer(containerId);
    return await container.inspect();
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
