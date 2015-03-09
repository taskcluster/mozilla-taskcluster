import PushExchange from '../exchanges/push';
import Base from './base';
let Joi = require('joi');

export default class PushJob extends Base {

  get configSchema() {
    return {
      publisher: Joi.object().required()
    }
  }

  async work(job) {
    let { pushref, repo } = job.data;
    let push = await this.runtime.pushlog.getOne(repo.url, pushref.id);

    let message = {
      id: push.id,
      url: repo.url,
      alias: repo.alias,
      date: new Date(push.date * 1000).toJSON(),
      user: push.user,
      changesets: push.changesets.map((cset) => {
        return {
          author: cset.author,
          branch: cset.branch,
          desc: cset.desc,
          files: cset.files,
          node: cset.node,
          tags: cset.tags
        }
      })
    };

    let routingKeys = {
      alias: repo.alias
    };

    await this.publisher.publish(
      PushExchange, routingKeys, message
    );
  }
}

