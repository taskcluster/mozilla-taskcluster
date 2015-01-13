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

  async scheduleTaskGraphJob(resultset, repo, push) {
    // After we create the resultset it is safe to post over the taskcluster
    // graph...
    let job = this.createJob('taskcluster-graph', {
      title: `Create graph ${repo.alias}@${resultset.revision_hash}`,
      revision_hash: resultset.revision_hash,
      repo,
      push,
    });

    job.attempts(10);
    job.searchKeys(['repo.alias', 'push.id']);
    job.backoff({ type: 'exponential', delay: 1000 * 30 });
    await this.scheduleJob(job);
  }

  async work(job) {
    let { repo, push } = job.data;
    let cred = this.credentials[repo.alias];

    if (!cred) {
      job.log('No credentials for %s skipping', repo.alias);
      return;
    }

    let project = new Treeherder(repo.alias, {
      consumerKey: cred.consumer_key,
      consumerSecret: cred.consumer_secret,
      baseUrl: this.config.treeherder.apiUrl
    });

    let resultset = formatResultset(repo.alias, push);
    await project.postResultset([resultset]);

    // If the repository has a project configuration schedule a task cluster
    // graph creation job...
    if (this.projects[repo.alias]) {
      await this.scheduleTaskGraphJob(resultset, repo, push);
    }
  }
}
