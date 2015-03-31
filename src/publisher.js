/**
AMQP Publisher
*/

import Exchange from './exchange';
import amqplib from 'amqplib';
import toJSONSchema from 'joi-to-json-schema';
import Debug from 'debug';

let Joi = require('joi');
let debug = Debug('publisher');

class Publisher {
  constructor(opts) {
    // validated below
    Object.assign(this, opts);
  }

  async close() {
    await this.channel.close();
    await this.conn.close();
  }

  convertRoutingKey(exchange, object) {
    let keys = exchange.config.routingKey;
    let result = exchange.config.routingKey.map((element) => {
      let value = object[element.name];
      if (!value) throw new Error(`Missing key ${element.name}`);
      return value;
    });
    return result.join('.');
  }

  async assertExchanges(...exchanges) {
    await Promise.all(exchanges.map((ex) => {
      let name = `${this.exchangePrefix}${ex.config.exchange}`;
      return this.channel.assertExchange(name, 'topic');
    }));
  }

  async publish(exchange, routingKey, inputMessage) {
    Joi.assert(
      exchange,
      Joi.object().type(Exchange)
    );

    let outputMessage = Joi.validate(inputMessage, exchange.config.schema);
    let exchangeName = `${this.exchangePrefix}${exchange.config.exchange}`;
    let keys = exchange.config.routingKey;

    // Invalid schema should never happen as we control input...
    if (outputMessage.error) {
      throw outputMessage.error;
    }

    if (typeof routingKey === 'object') {
      routingKey = this.convertRoutingKey(exchange, routingKey);
    }

    let content = JSON.stringify(outputMessage.value);
    let opts = {
      persistent: true,
      contentType: 'application/json'
    };

    return await new Promise((accept, reject) => {
      debug('sending message', { exchangeName, routingKey });
      this.channel.publish(
        exchangeName,
        routingKey,
        new Buffer(content),
        opts,
        (error, value) => {
          if (error) return reject(error);
          accept(value);
        }
      );
    });
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
          exchange,
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
