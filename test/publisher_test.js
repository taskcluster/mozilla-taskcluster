import Exchange from '../src/exchange';
import publisher from '../src/publisher';
import toJSONSchema from 'joi-to-json-schema';
import assert from 'assert';
import { createClient, PulseListener } from 'taskcluster-client';
import waitFor from './wait_for';

let Joi = require('joi');

suite('publisher', function() {

  let TestExchange = new Exchange('magicfoo').
    name('doMagicFoo').
    title('I am the magic foo').
    description('wootbar').
    routingKeys(
      { name: 'first', summary: 'yup' },
      { name: 'second', summary: 'sum', multipleWords: true, required: false }
    ).
    schema(Joi.object().unknown(false).keys({
      wootbar: Joi.string().required(),
      number: Joi.number().required()
    }));

  let subject, listener;
  setup(async function() {
    subject = await publisher({
      title: 'tests',
      description: 'super test',
      connectionString: this.config.commitPublisher.connectionString,
      exchangePrefix: 'test/'
    });

    // create the exchange each time to ensure we are in known state.
    await subject.assertExchanges(TestExchange);

    listener = new PulseListener({
      credentials: {
        connectionString: this.config.commitPublisher.connectionString
      }
    });
  });

  teardown(async function() {
    await subject.close();
  });

  test('toSchema()', function() {
    let schema = subject.toSchema(TestExchange);
    let expected = {
      title: subject.title,
      description: subject.description,
      exchangePrefix: subject.exchangePrefix,
      entries: [{
        type: 'topic-exchange',
        exchange: TestExchange.config.exchange,
        name: TestExchange.config.name,
        title: TestExchange.config.title,
        description: TestExchange.config.description,
        routingKey: [
          { name: 'first', summary: 'yup', multipleWords: false, required: true },
          { name: 'second', summary: 'sum', multipleWords: true, required: false }
        ],
        schema: toJSONSchema(TestExchange.config.schema)
      }]
    };
    assert.deepEqual(schema, expected);
  });

  test('publish()', async function() {
    let XfooEvents = createClient(subject.toSchema(TestExchange));
    let events = new XfooEvents();
    assert.ok(events.doMagicFoo);

    let publish = async function() {
      await subject.publish(
        TestExchange,
        { first: 'first', second: 'second' },
        { wootbar: 'is wootbar', number: 5 }
      );
    };

    listener.bind(events.doMagicFoo());

    let message;
    listener.on('message', function(msg) {
      message = msg;
    })

    // Run an initial publish as we may not have created the exchange yet...
    await publish();
    await listener.resume();

    await subject.publish(
      TestExchange,
      { first: 'first', second: 'second' },
      { wootbar: 'is wootbar', number: 5 }
    );

    await waitFor(async function() {
      return !!message;
    });

    assert.deepEqual(message.payload, {
      wootbar: 'is wootbar',
      number: 5
    });

    assert.equal(message.routingKey, 'first.second');
    assert.deepEqual(message.routing, {
      first: 'first',
      second: 'second'
    });
  });
});
