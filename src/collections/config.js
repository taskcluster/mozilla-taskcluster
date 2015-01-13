import { Collection } from '../db';
import * as Joi from 'joi';

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
