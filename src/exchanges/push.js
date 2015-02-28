import Exchange from '../exchange';
let Joi = require('joi');

export default new Exchange('pushlog').
  title('Mozilla repository commit exchange').
  name('push').
  description(`
    Sent when the pushlog for monitored repositories has been updated.
  `).
  routingKeys(
    {
      name: 'alias',
      summary: 'Repository alias (i.e. alder, mozilla-central, etc...)'
    }
  ).
  schema(Joi.object().keys({
    id: Joi.number().required().description('pushlog id'),
    url: Joi.string().required().description('url for repository'),
    alias: Joi.string().required().description('repository alias'),
    date: Joi.date().required().description('date of the push'),
    user: Joi.string().required().
      description('user who pushed (usually an email)'),
    changesets: Joi.array().
      required().
      includes(
        Joi.object().keys({
          author: Joi.string().description('Author of changeset'),
          branch: Joi.string().description('Branch pushed to'),
          description: Joi.string().description('Commit message'),
          files: Joi.array().includes(Joi.string()).description('Files changed'),
          node: Joi.string().description('Changeset'),
          tags: Joi.array().description('tags for changeset')
        }).unknown(true)
      ).
      description('Each changeset pushed by user'),
  }));
