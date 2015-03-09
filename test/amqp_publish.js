import amqplib from 'amqplib';
import Joi from 'joi';

/**
Publish a test message on an exchange:

@param {Object} config for application.
@param {String} msg.exchange name of the exchange.
@param {String} msg.routing Routing pattern for message.
@param {Object} msg.payload payload for the message.
*/
export default async function(config, msg) {
  Joi.assert(config, Joi.object().keys({
    commitPublisher: Joi.object().keys({
      connectionString: Joi.string().required()
    }).unknown(true)
  }).unknown(true));

  Joi.assert(msg, Joi.object().keys({
    exchange: Joi.string().required(),
    routing: Joi.string().required(),
    payload: Joi.object().required()
  }));

  let credentials = config.commitPublisher.connectionString;
  let connection = await amqplib.connect(credentials);
  let channel = await connection.createConfirmChannel();

  let payload = new Buffer(JSON.stringify(msg.payload));
  let options = {
    contentType: 'application/json'
  };

  // All exchanges are topic...
  await channel.assertExchange(msg.exchange, 'topic');
  await channel.publish(msg.exchange, msg.routing, payload, options);
  await channel.close();
  await connection.close();
}
