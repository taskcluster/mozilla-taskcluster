import * as Joi from 'joi';

export default class Exchange {
  constructor(exchange) {
    if (!(this instanceof Exchange)) {
      return new Exchange(exchange);
    }

    Joi.assert(exchange, Joi.string());
    this.config = {
      exchange,
      name: exchange,
      title: exchange,
      description: '',
      schema: Joi.object(),
      routingKey: []
    };
  }

  name(name) {
    Joi.assert(name, Joi.string());
    this.config.name = name;
    return this;
  }

  title(title) {
    Joi.assert(title, Joi.string());
    this.config.title = title;
    return this;
  }

  description(description) {
    let result = Joi.validate(description, Joi.string().trim());
    if (result.error) throw result.error;
    this.config.description = result.value;
    return this;
  }

  schema(schema) {
    Joi.assert(schema, Joi.object());
    this.config.schema = schema;
    return this;
  }

  routingKeys(...keys) {
    let result = Joi.validate(keys, Joi.array().required().includes(
      Joi.object().keys({
        name: Joi.string().required(),
        summary: Joi.string().trim().required(),
        constant: Joi.string(),
        multipleWords: Joi.boolean().default(false),
        required: Joi.boolean().default(true)
      })
    ));

    if (result.error) throw result.error;
    this.config.routingKey = result.value;
    return this;
  }
}
