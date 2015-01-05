/**
The monitor class is designed to watch and update _all_ repositories meaning
you should never need more then one of these instances running.
*/
import urljoin from 'urljoin';
import qs from 'querystring';
import Debug from 'debug';
import assert from 'assert';
import denodeify from 'denodeify';

import PushlogClient from './pushlog_client';

let debug = Debug('treeherder-proxy:monitor');

// Behold! The singleton this is done mostly to benefit form the maximum amount
// of caching in sockets and for ease of use.
let pushlog = new PushlogClient();

// Helper function for sending messages to kue with the defaults sane for the
// monitor.
async function schedulePush(jobs, topic, body) {
  let msg = jobs.create('push', body).
    attempts(5).
    searchKeys(['repo.alias']).
    backoff({ type: 'exponential' });

  await denodeify(msg.save.bind(msg))();
}

export default class Monitor {
  constructor(jobs, repos, options={}) {
    this.jobs = jobs;
    this.repos = repos;
    // List of repositories indexed by id.
    this.list = {};
    // List of repositories and their health check indexed by id.
    this.locks = {};

    // Maximum number of pushes to fetch
    this.interval = options.interval || 2000;
    this.maxPushFetches = options.maxPushFetches || 100;
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

    if (endID - startID > this.maxPushFetches) {
      debug('Beyond maximum pushes for %s truncating fetch', repo.url);
      startID = endID - this.maxPushFetches;
    }

    if (startID < endID) {
      await pushlog.iterate(repo.url, startID, endID, async function(push) {
        // Messages are sent "at least once" this means in edge cases or crashes
        // the messages may be sent more then once...

        let titleId = '(unknown)';
        if (push.changesets && push.changesets[0]) {
          titleId = push.changesets[0].node;
        }

        let title = `Push ${push.id} for ${repo.alias} cset ${titleId}`;

        let body = {
          repo,
          push,
          title: title
        };

        await schedulePush(this.jobs, 'push', body);

        // TODO: Do something with each push...
        // Update after each push...
        let update = await this.repos.update(repo, async function(doc) {
          assert(
            push.id > doc.lastPushId,
            `
            Race detected in push id update ${repo.alias} \n
              Current push id ${doc.lastPushId} is greater than push ${push.id}
            `
          )

          // The changeset could be useful in the case where we need to poll in
          // a fashion after the pushlog is destroyed for some reason...
          doc.lastChangeset = push.changesets[push.changesets.length - 1].node;

          // Last push id is the ideal method and is more reliable unless
          // pushlog is destroyed, etc...
          doc.lastPushId = push.id;
          return doc;
        });

        // Update our cached copy to the new etag allowing updates to skip
        // looking up the current document if the state is consistent already.
        repo._etag = update._etag;

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
      console.log(`Error processing run ${repo.url}\n ${e.stack}`);
      lock.active = false;
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
      if (!(this.locks[repo.id])) {
        ops.push(this.tryCheck(repo));
        continue;
      }

      let check = this.locks[repo.id];
      if (!check.active) {
        ops.push(this.tryCheck(repo));
        continue;
      }
    }

    // Run all operations...
    await Promise.all(ops);
  }

  async start(checkInterval=2000) {
    if (this._intervalHandle) throw new Error('Already running...');
    debug('start : interval %d', this.interval)

    // Update the repository list...
    await this.fetchRepositories();

    // Note this intentionally runs every checkInterval rather then blocking
    // then sleeping for some time... This ensures if one check is blocked we
    // still run the others (and the check method above ensures we do check the
    // same repositories concurrently.
    this._intervalHandle = setInterval(() => {
      this.check().catch((e) => {
        console.error('Error processing a check', e);
      })
    }, this.interval);
  }

  stop() {
    clearInterval(this._intervalHandle);
  }
}
