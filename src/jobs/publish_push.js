import PushExchange from '../exchanges/push';

export default async function(publisher, job) {
  let data = job.data;
  let message = {
    id: data.push.id,
    url: data.repo.url,
    alias: data.repo.alias,
    date: new Date(data.push.date * 1000).toJSON(),
    user: data.push.user,
    changesets: data.push.changesets.map((cset) => {
      return {
        author: cset.author,
        branch: cset.branch,
        description: cset.desc,
        files: cset.files,
        node: cset.node,
        tags: cset.tags
      }
    })
  };

  let routingKeys = {
    alias: data.repo.alias
  };

  await publisher.publish(
    PushExchange, routingKeys, message
  );
}
