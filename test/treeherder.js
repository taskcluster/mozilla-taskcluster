import urlJoin from 'urljoin';
import request from 'superagent';
import waitFor from './wait_for';
import slugid from 'slugid';

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
      });

    if (res.status === 404) return null;
    if (res.error) throw res.error;
    return res.body.results[0];
  }

  async getJobs(resultsetId) {
    let url = urlJoin(this.baseUrl, `project/try/jobs`);
    let res = await request.
      get(url).
      query({
        count: 2000,
        result_set_id: resultsetId,
        debug: 'true'
      });

    if (res.status === 404) return null;
    if (res.error) throw res.error;
    return res.body.results;
  }

  async waitForResultset(revisionHash) {
    return await waitFor({ sleep: 1000 }, async function() {
      return await this.getResultset(revisionHash);
    }.bind(this));
  }

  async waitForJobState(revisionHash, taskId, runId, state) {
    return await waitFor({ sleep: 125, maxTries: 600 }, async function() {
      let resultset = (await this.getResultset(revisionHash));
      let resultsetId = resultset.id;
      let jobs = await this.getJobs(resultsetId)

      // If there is no job yet wait until a job is available.
      if (!jobs.length) {
        return false;
      }

      let jobGuid = `${slugid.decode(taskId)}/${runId}`
      return jobs.find((job) => {
        return job.job_guid === jobGuid && job.state === state;
      });
    }.bind(this));
  }
}
