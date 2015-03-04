import eventToPromise from 'event-to-promise';
import { spawn } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';

/**
helper for running src/bin/* processes
*/

class Process {
  constructor(proc) {
    this.proc = proc;
  }

  async kill(code) {
    this.proc.kill(code);
    return await eventToPromise(this.proc, 'exit');
  }
}

export default function start(name) {
  return new Promise((accept, reject) => {
    let bin6to5 = __dirname + '/../node_modules/.bin/6to5-node';
    let binary = `${__dirname}/../src/bin/${name}`;
    if (!fs.existsSync(binary)) {
      throw new Error(`Invalid (missing) binary ${binary}`);
    }

    let proc = spawn(
      bin6to5,
      ['-r', binary, 'test'],
      { stdio: 'pipe', env: process.env }
    );

    let result = new Process(proc);
    let handleEarlyExit = () => {
      reject(new Error(`early exit starting process ${name}`));
    };

    proc.on('exit', handleEarlyExit);
    proc.stderr.pipe(process.stderr);
    proc.stdout.on('data', (buffer) => {
      let value = buffer.toString();
      if (value.trim() === '<starting>') {
        process.on('exit', proc.kill.bind(proc));
        accept(result);
      } else {
        process.stdout.write(value);
      }
    });
  });
}
