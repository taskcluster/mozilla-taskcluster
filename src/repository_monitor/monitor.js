/**
The monitor class is designed to watch and update _all_ repositories meaning
you should never need more then one of these instances running.
*/

import request from 'superagent-promise';
import urljoin from 'urljoin';
import qs from 'querystring';
import Debug from 'debug';
import assert from 'assert';

let debug = Debug('treeherder-proxy:monitor');

export default class Monitor {
  static jsonPush(url, props={}) {
    let query = Object.assign({}, props);
    query.version = 2;
    return `${urljoin(url, '/json-pushes/')}?${qs.stringify(query)}`;
  }

  constructor(repos) {
    this.repos = repos;
    // List of repositories indexed by id.
    this.list = {};
    // List of repositories and their health check indexed by id.
    this.checks = {};
  }

  async fetchRepositories() {
    let repos = await this.repos.query(`SELECT * FROM r`);
    for (let repo of repos.feed) {
      this.list[repo.id] = repo;
    }
  }

  async checkRepository(repo) {
    let check;
    debug('Check repository %s', repo.url);
    // Get the current check...
    check = this.checks[repo.id] || {
      active: true,
      lastPushId: repo.lastPushId
    };

    this.checks[repo.id] = check;

    let url = Monitor.jsonPush(repo.url, { full: 1 });
    let initialRes = await request.get(url).end();
    let body = initialRes.body;

    if (check.lastPushId < body.lastpushid) {
      debug('Updated push %s now at %d', repo.alias, body.lastpushid);
      await this.repos.update(repo.id, async function(doc) {
        assert(
          body.lastpushid > doc.lastPushId,
          `Race detected in push id update ${repo.id}`
        )
        doc.lastPushId = body.lastpushid;
        return doc;
      });

      check.lastPushId = body.lastpushid;
    }
  }

  async check() {
    debug('run check');
    let ops = []

    // The idea here is to build up the list of operations then run them in
    // parallel.
    for (let id of Object.keys(this.list)) {
      let repo = this.list[id];
      //debug('check', repo.alias, repo.id);
      // Repository has not yet been checked...
      if (!(repo.id in this.checks)) {
        ops.push(this.checkRepository(repo));
        return;
      }

      let check = this.checks[repo.id];
      if (!check.active) {
        ops.push(this.checkRepository(repo));
        return;
      }
    }

    // Run all operations...
    await Promise.all(ops);
  }

  async start(checkInterval=2000) {
    if (this.interval) throw new Error('Already running...');
    debug('start : interval %d', checkInterval)

    // Update the repository list...
    await this.fetchRepositories();

    // Note this intentionally runs every checkInterval rather then blocking
    // then sleeping for some time... This ensures if one check is blocked we
    // still run the others (and the check method above ensures we do check the
    // same repositories concurrently.
    this.interval = setInterval(() => {
      this.check().catch((e) => {
        console.error('Error processing a check', e);
      })
    }, checkInterval);
  }

  stop() {
    clearInterval(this.interval);
  }
}


