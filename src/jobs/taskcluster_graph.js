import mustache from 'mustache';
import instantiate from '../try/instantiate'
import request from 'superagent-promise';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';

import Path from 'path';
import Base from './base';
import URL from 'url';

/**
Parses given url into path and host parts.


  parseUrl('https://hg.mozilla.org/try/');
  // => { host: 'https://hg.mozilla.org', path: '/try' }

*/
function parseUrl(url) {
  let parsed = URL.parse(url);
  let path = Path.resolve(parsed.path);

  path = (path === '/') ? '' : path;

  return {
    path,
    host: `${parsed.protocol || 'http'}//${parsed.host}`
  };
}

export default class TaskclusterGraphJob extends Base {
  async work(job) {
    let { revision_hash, pushref, repo } = job.data;
    let push = await this.runtime.pushlog.getOne(repo.url, pushref.id);
    let tryConfig = this.config.try;
    let lastChangeset = push.changesets[push.changesets.length - 1];

    // We need to figure out where the task graph template is...
    let project = tryConfig.projects[repo.alias];
    if (!project) {
      // Jobs should never be scheduled in this case this is some sort of error
      // or misconfiguration which will cause congestion.
      throw new Error(
        `Missing configuration in task graph push for repo ${repo.alais}`
      );
    }

    let repositoryUrlParts = parseUrl(repo.url);

    let urlTemplate = project.url || tryConfig.defaultUrl;
    let url = mustache.render(urlTemplate, {
      // These values are defined in projects.yml
      alias: repo.alias,
      revision: lastChangeset.node,
      path: repositoryUrlParts.path,
      host: repositoryUrlParts.host
    });

    job.log('Fetching url (%s) for %s push id %d ', url, repo.alias, push.id);

    let rawGraphReq = await request.get(url).
      buffer(true).
      end();

    if (rawGraphReq.error) throw rawGraphReq.error;

    let graph = instantiate(rawGraphReq.text, {
      owner: push.user,
      source: url,
      revision: lastChangeset.node,
      project: repo.alias,
      revision_hash,
      comment: lastChangeset.desc,
      pushlog_id: String(push.id),
      url: repo.url,
      importScopes: true
    });

    let id = slugid.v4();
    let scopes = project.scopes || tryConfig.defaultScopes;

    let scheduler = new taskcluster.Scheduler({
      credentials: this.config.taskcluster.credentials,
      authorizedScopes: scopes
    });

    job.log('Posting job with id %s and scopes', id, graph.scopes.join(', '));
    await scheduler.createTaskGraph(id, graph);
  }
}
