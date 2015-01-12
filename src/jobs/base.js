import * as Joi from 'joi';
import denodeify from 'denodeify';

/**
Base class to wrap basic behaviours of every job.

class MyJob extends Base {

  get configSchema() {
    return {
      myconfig: Joi.string().description('amazing config!')
    }
  }

  async work(job) {
    // ... Run the job...
  }

}

*/
export default class Base {
  constructor(opts = {}) {
    let schema = {
      config: Joi.object().required().description('global config object'),
      runtime: Joi.object().required().description('global runtime'),
    };

    let keys = Object.assign(schema, this.configSchema || {});
    Joi.assert(opts, schema);
    Object.assign(this, opts);
  }

  /**
  Shortcut for creating a job using `this.runtime.jobs.create`
  */
  createJob(topic, body) {
    Joi.assert(topic, Joi.string());
    Joi.assert(body, Joi.object());

    return this.runtime.jobs.create(topic, body);
  }

  /**
  Schedule a job created by `createJob`

    let job = this.createJob('do', { stuff: true });
    job.attempts(5);

    await this.scheduleJob(job);

  */
  async scheduleJob(job) {
    return await denodeify(job.save).call(job);
  }
}
