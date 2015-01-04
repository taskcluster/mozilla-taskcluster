import exchange from '../exchange';

export let CommitExchange = exchange('Mozilla repository commit exchange').
  description(`
    The commit exchange publishes messages based on incoming commits from the
    mozilla pushlogs.
  `).
  keys(
    exchange.key('repository').description(`
      Normalized (no protocol) path to repository
    `)
  ).
  schema(Joi.object.keys({
    id: Joi.string().required().description('pushlog id'),
    date: Joi.date().required().description('date of the push'),
    user: Joi.string().email().required().description('user who pushed'),
    changesets: Joi.array().
      required().
      includes(Joi.object().keys({
        author: Joi.string().description('Author of changeset'),
        branch: Joi.string().description('Branch pushed to'),
        description: Joi.string().description('Commit message'),
        files: Joi.array().includes(Joi.string()).description('Files changed'),
        node: Joi.string().description('Changeset'),
        tags: Joi.array().description('tags for changeset')
      })).
      unknown(true).
      description('Each changeset pushed by user'),
  })
