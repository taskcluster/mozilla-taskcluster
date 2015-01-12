import mustache from 'mustache';
import instantiate from '../try/instantiate'
import Base from './base';


export default class TaskclusterGraphJob extends Base {
  async work(job) {
    let { revision_hash, push, repo } = job.data;
    let revision = push.changesets[push.changesets.length - 1].node;
    let tryConfig = config.try;

    // We need to figure out where the task graph template is...
    let repoConfig = tryConfig.projects[repo.alias];
    if (!repoConfig) {
      // If there is no config just skip the task...
      return;
    }
  }
}
