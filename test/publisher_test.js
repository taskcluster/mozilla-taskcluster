import exchange from '../src/exchange';
import publisher from '../src/publisher';
import * as Joi from 'joi';
import toJSONSchema from 'joi-to-json-schema';
import assert from 'assert';

suite('publisher', function() {

  let Exchange = exchange('magicfoo').
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

  let subject;
  setup(async function() {
    subject = await publisher({
      title: 'tests',
      description: 'super test',
      connectionString: this.config.commitPublisher.connectionString,
      exchangePrefix: 'test/'
    });
  });

  test('toSchema()', function() {
    let schema = subject.toSchema(Exchange);
    let expected = {
      title: subject.title,
      description: subject.description,
      exchangePrefix: subject.exchangePrefix,
      entries: [{
        type: 'topic-exchange',
        exchange: `${subject.exchangePrefix}${Exchange.config.exchange}`,
        name: Exchange.config.name,
        title: Exchange.config.title,
        description: Exchange.config.description,
        routingKey: [
          { name: 'first', summary: 'yup', multipleWords: false, required: true },
          { name: 'second', summary: 'sum', multipleWords: true, required: false }
        ],
        schema: toJSONSchema(Exchange.config.schema)
      }]
    };
    assert.deepEqual(schema, expected);
  });
});
