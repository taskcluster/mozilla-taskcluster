import { Collection } from '../db';
let Joi = require('joi');

/**
Contains configuration details for different environments...
*/
export default class Config extends Collection {
  get id() {
    return 'config';
  }

  get schema() {
    return Joi.object();
  }
}
