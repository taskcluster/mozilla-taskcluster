import urlJoin from 'urljoin';
import request from 'superagent-promise';
import waitFor from './wait_for';

export default class {
  constructor(url) {
    this.baseUrl = url
  }

  async getResultset(revisionHash) {
    let url = urlJoin(this.baseUrl, 'project/try/resultset/');
    let res = await request.
      get(url).
      query({
        count: 1,
        revision_hash: revisionHash,
        with_jobs: 'true',
        debug: 'true'
      }).
      end();

    if (res.status === 404) return null;
    if (res.error) throw res.error;
    return res.body.results[0];
  }

  async waitForResultset(revisionHash) {
    return await waitFor(async function() {
      return await this.getResultset(revisionHash);
    }.bind(this));
  }

  async waitForJobState(revisionHash, state) {
    return await waitFor(async function() {
      let resultset = (await this.getResultset(revisionHash));

      // If there is no job yet wait until a job is available.
      if (!resultset.platforms.length) {
        return false;
      }

      // Get the first job.
      var job = resultset.platforms[0].groups[0].jobs[0];
      if (job.state !== state) {
        return false;
      }
      return job;
    }.bind(this));
  }
}
