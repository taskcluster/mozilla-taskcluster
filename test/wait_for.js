import Debug from 'debug';

let debug = Debug('test:wait_for');

/**
The sleep function you expect.
*/
export async function sleep(n=100) {
  return new Promise((accept) => {
    setTimeout(accept, n);
  });
}

export default async function waitFor(opts={}, fn, ...args) {
  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }

  let maxTries = opts.maxTries || 5;
  let waitBetween = opts.sleep || 50;
  let start = Date.now();

  for (let currentTry = 0; currentTry < maxTries; currentTry++) {
    debug('Starting wait for attempt...', currentTry);
    let result = await fn(...args);
    if (result) return result;
    await sleep(waitBetween);
  }

  throw new Error(
    `Failed to get truthy result after ${Date.now() - start} ms`
  );
}
