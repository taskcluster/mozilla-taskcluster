#! /usr/bin/env node
/**
Import repositories from treeherder proper and output the json structure the
the proxy service uses...
*/

import '6to5/polyfill';
import loadConfig from '../config';
import createRuntime from '../runtime';
import request from 'superagent-promise';
import urljoin from 'urljoin';
import Repositories from '../collections/repositories';

import { ArgumentParser } from 'argparse';

let parser = new ArgumentParser();
parser.addArgument(['profile'], {
  help: 'Configuration profile to use'
});

async function main() {
  let argv = parser.parseArgs();

  let config = await loadConfig(process.argv[2]);
  let runtime = await createRuntime(config);

  let url = urljoin(config.treeherder.apiUrl, '/repository/');
  let res = await request.get(url).end();

  if (res.error) throw res.error;

  // Map the repositories into our internal structure...
  let repos = res.body.reduce((all, thRepo) => {
    // Skip any non-hg urls we don't poll these at least not right now...
    if (thRepo.url.indexOf('https://hg.mozilla.org') !== 0) {
      return all;
    }

    let normalizedUrl = urljoin(thRepo.url, '/');
    all.push({
      alias: thRepo.name,
      url: normalizedUrl
    });

    return all;
  }, []);

  console.log(repos);
}

main().catch((err) => {
  setTimeout(() => { throw err; });
})
