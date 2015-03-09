/**
The monitor class is designed to watch and update _all_ repositories meaning
you should never need more then one of these instances running.
*/
import urljoin from 'urljoin';
import qs from 'querystring';
import Debug from 'debug';
import assert from 'assert';
import denodeify from 'denodeify';

import PushlogClient from './client';

// 30 seconds...
const JOB_RETRY_DELAY = 1000 * 30;

let debug = Debug('treeherder-proxy:monitor');

// Behold! The singleton this is done mostly to benefit form the maximum amount
// of caching in sockets and for ease of use.
let pushlog = new PushlogClient();

// Helper function for sending messages to kue with the defaults sane for the
// monitor.
async function schedulePush(jobs, topic, body) {
  let msg = jobs.create(topic, body).
    attempts(30).
    searchKeys(['repo.alias']).
    backoff({ type: 'exponential', delay: JOB_RETRY_DELAY });

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
    let repos = await this.repos.find();
    for (let repo of repos) {
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
        let doc = await this.repos.findById(repo.id);
        // In theory it's possible for multiple monitors to be running and
        // fighting over state... If doc.lastPushId is > then push.id set it to
        // the push id...
        if (doc.lastPushId > push.id) {
          console.error(`
            Potential data race between multiple monitors or database mutations.

            Current push id ${push.id} is less than last documented push ${doc.lastPushId}
          `);

          // This is moderately sane since we are moving to a known state...
          lock.lastPushId = doc.lastPushId;
          return;
        }

        // Messages are sent "at least once" this means in edge cases or crashes
        // the messages may be sent more then once...
        let lastChangeset = push.changesets[push.changesets.length - 1];
        let titleId = lastChangeset;
        let title = `Push ${push.id} for ${repo.alias} cset ${titleId}`;

        let body = {
          repo,
          pushref: { id: push.id },
          title: title
        };

        await Promise.all([
          schedulePush(this.jobs, 'publish-push', body),
          schedulePush(this.jobs, 'treeherder-resultset', body)
        ]);

        // For additional safety only update the row if we are sure of it's
        // lastPushId is exactly one less then the new value.
        let query = { id: doc.id, lastPushId: doc.lastPushId };
        doc.lastPushId = push.id;
        doc.lastChangeset = lastChangeset;

        await this.repos.replace(query, doc);

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
