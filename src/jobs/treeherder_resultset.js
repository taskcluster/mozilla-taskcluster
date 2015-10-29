import formatResultset from '../treeherder/resultset';
import denodeify from 'denodeify'

import PushExchange from '../exchanges/push';
import Treeherder from 'mozilla-treeherder/project';
import Base from './base';

let Joi = require('joi');

export default class TreeherderResultsetJob extends Base {
  constructor(opts = {}) {
    super(opts);

    // Treeherder repository credentials...
    this.credentials = JSON.parse(this.config.treeherder.credentials);

    // Project configuration (see projects.yml).
    this.projects = this.config.try.projects;
  }

  async scheduleTaskGraphJob(resultset, repo, pushref) {
    // After we create the resultset it is safe to post over the taskcluster
    // graph...
    let job = this.createJob('taskcluster-graph', {
      title: `Create graph ${repo.alias}@${resultset.revision_hash}`,
      revision_hash: resultset.revision_hash,
      repo,
      pushref,
    });

    job.attempts(10);
    job.searchKeys(['repo.alias', 'push.id']);
    job.backoff({ type: 'exponential', delay: 1000 * 30 });
    await this.scheduleJob(job);
  }

  async work(job) {
    let { repo, pushref } = job.data;
    let cred = this.credentials[repo.alias];
    let push = await this.runtime.pushlog.getOne(repo.url, pushref.id);

    if (!cred) {
      console.log(`No credentials for project ${repo.alias}, skipping`);
      return;
    }

    let treeherderProject = new Treeherder(repo.alias, {
      consumerKey: cred.consumer_key,
      consumerSecret: cred.consumer_secret,
      baseUrl: this.config.treeherder.apiUrl
    });

    let resultset = formatResultset(repo.alias, push);
    await treeherderProject.postResultset([resultset]);

    let lastRev = resultset.revisions[resultset.revisions.length - 1];
    let tryProject = this.projects[repo.alias];

    // Common idom is to include "DONTBUILD" in changes to ammend something in a
    // previous commit like code comments or modify something that is not part
    // of CI.
    if (lastRev.comment.indexOf("DONTBUILD") !== -1) {
      console.log(`Commit for project '${repo.alias}' contains DONTBUILD, skipping`);
      return;
    }

    if (this.config.try.enabled && tryProject) {
      if (
        tryProject.contains &&
        lastRev.comment.indexOf(tryProject.contains) === -1
      ) {
        console.log(
            `Skipping submitting graph for project '${repo.alias}'. ` +
            `Commit does not contain ${tryProject.contains}`
        );
        return;
      }
      console.log(`Scheduling taskcluster jobs for project '${repo.alias}'`);
      await this.scheduleTaskGraphJob(resultset, repo, pushref);
    }
  }
}
