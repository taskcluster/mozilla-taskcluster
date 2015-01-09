import PushExchange from '../exchanges/push';
import Treeherder from 'mozilla-treeherder/project';
import formatResultset from '../treeherder/resultset';

export default async function(creds, config, job) {
  let data = job.data;
  let cred = creds[data.repo.alias];

  if (!cred) {
    throw new Error(
      `Missing treeherder credentials for ${repo.alias} during push ${push.id}`
    );
  }

  let project = new Treeherder(data.repo.alias, {
    consumerKey: cred.consumer_key,
    consumerSecret: cred.consumer_secret,
    baseUrl: config.apiUrl
  });

  let resultset = formatResultset(data.repo.alias, data.push);
  await project.postResultset([resultset]);
}
