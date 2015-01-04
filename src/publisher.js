/**
AMQP Publisher
*/

import * as Joi from 'joi';
import Exchange from './exchange';
import amqplib from 'amqplib';
import toJSONSchema from 'joi-to-json-schema';

class Publisher {
  constructor(opts) {
    // validated below
    Object.assign(this, opts);
  }

  async close() {
    await this.conn.close();
    await this.channel.close();
  }

  /**
  Converts a set of exchanges into the taskcluster-client recognized schema.

  See: https://github.com/taskcluster/taskcluster-base/blob/master/schemas/exchanges-reference.json
  */
  toSchema(...exchanges) {
    return {
      title: this.title,
      description: this.description,
      exchangePrefix: this.exchangePrefix,
      entries: exchanges.map((builder) => {
        // Extract the useful bits of information from the builder config...
        let {
          name,
          title,
          exchange,
          description,
          routingKey,
          schema
        } = builder.config;

        return {
          // Everything is a topic exchange for now...
          type: 'topic-exchange',
          exchange: `${this.exchangePrefix}${exchange}`,
          name,
          title,
          description,
          routingKey,
          // This is not quite correct (this usually expects a uri) but this is
          // more useful for generating that information later on...
          schema: toJSONSchema(schema)
        }
      })
    };
  }
}

export default async function publsiher(input) {
  let validate = Joi.validate(
    input,
    Joi.object().keys({
      title: Joi.string().required().
        description(`publisher group title`),
      description: Joi.string().required().
        description(`Publisher group description`),
      connectionString: Joi.string().required().
        description(`amqp connection string`),
      exchangePrefix: Joi.string().default('').
        description(`default exchange prefix to use`)
    })
  );

  if (validate.error) throw error;
  let opts = validate.value;

  let conn = await amqplib.connect(opts.connectionString);
  let channel = await conn.createConfirmChannel();

  return new Publisher({
    title: opts.title,
    description: opts.description,
    exchangePrefix: opts.exchangePrefix,
    conn,
    channel
  });
}
