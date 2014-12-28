/**
The monitor class is designed to watch and update _all_ repositories meaning
you should never need more then one of these instances running.
*/

import PushlogClient from './pushlog_client';
import urljoin from 'urljoin';
import qs from 'querystring';
import Debug from 'debug';
import assert from 'assert';

let debug = Debug('treeherder-proxy:monitor');

// Behold! The singleton this is done mostly to benefit form the maximum amount
// of caching in sockets and for ease of use.
let pushlog = new PushlogClient();

export default class Monitor {
  constructor(repos) {
    this.repos = repos;
    // List of repositories indexed by id.
    this.list = {};
    // List of repositories and their health check indexed by id.
    this.locks = {};
  }

  async fetchRepositories() {
    let repos = await this.repos.query(`SELECT * FROM r`);
    for (let repo of repos.feed) {
      this.list[repo.id] = repo;
    }
  }

  async runCheck(repo, lock) {
    let status = await pushlog.get(repo.url);
    let startID = lock.lastPushId;
    let endID = status.lastPushId;

    if (startID < endID) {
      console.log('check log', lock, startID, endID);
      await pushlog.iterate(repo.url, startID, endID, async function(push) {
        // TODO: Do something with each push...
        // Update after each push...
        await this.repos.update(repo.id, async function(doc) {
          assert(
            push.id > doc.lastPushId,
            `Race detected in push id update ${repo.id}`
          )
          doc.lastPushId = push.id;
          return doc;
        });
        lock.lastPushId = push.id;
        debug('Updated push %s now at %d', repo.alias, lock.lastPushId);
      }.bind(this));
    }
  }

  async tryCheck(repo) {
    // Reference or create the lock...
    let lock = this.locks[repo.id] || {
      active: false,
      lastPushId: repo.lastPushId
    };
    this.locks[repo.id] = lock;

    try {
      lock.active = true;
      await this.runCheck(repo, lock);
    } catch (e) {
      console.error(`Erorr processing run ${repo.url}\n ${e.stack}`);
    } finally {
      lock.active = false;
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
      if (!(repo.id in this.locks)) {
        ops.push(this.tryCheck(repo));
        return;
      }

      let check = this.locks[repo.id];
      if (!check.active) {
        ops.push(this.tryCheck(repo));
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
