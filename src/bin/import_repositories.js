#! /usr/bin/env node
/**
Import repositories from treeherder proper and output the json structure the
the proxy service uses...
*/

import 'babel/polyfill';
import cli from '../cli';
import packageInfo from '../../package.json';
import request from 'superagent';
import urljoin from 'urljoin';

cli(async function main(runtime, config) {
  let url = urljoin(config.treeherder.apiUrl, '/repository/');
  let userAgent = 'mozilla-taskcluster/' + packageInfo.version;
  let res = await request.get(url).
    set('User-Agent', userAgent);

  if (res.error) throw res.error;

  // Map the repositories into our internal structure...
  let seen = new Set();
  let repos = res.body.reduce((all, thRepo) => {
    // Skip any non-hg urls we don't poll these at least not right now...
    if (thRepo.url.indexOf('https://hg.mozilla.org') !== 0) {
      return all;
    }


    let normalizedUrl = urljoin(thRepo.url, '/');
    if (seen.has(normalizedUrl)) {
      console.log('duplicate url', thRepo);
      return all;
    }

    all.push({
      alias: thRepo.name,
      url: normalizedUrl
    });

    seen.add(normalizedUrl);

    return all;
  }, []);

  let ops = repos.map(function(doc) {
    return runtime.repositories.createIfNotExists(doc);
  });

  await Promise.all(ops);
  console.log('Finished importing %d', ops.length)
  process.exit();
});
