#! /usr/bin/env node

import request from 'superagent-promise';

async function main() {
  let start = 30700;
  let end = 46847;
  let url = `https://hg.mozilla.org/try/json-pushes/?version=2`

  let res = await request.get(url).end();

  let len = Object.keys(res.body.pushes).length;

  console.log(len, end - start);
}

main().catch((e) => { setTimeout(() => { throw e; }) });
