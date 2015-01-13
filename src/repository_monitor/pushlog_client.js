import request from 'superagent-promise';
import urljoin from 'urljoin';
import { Agent as HttpsAgent } from 'https';
import { Agent as HttpAgent } from 'http';
import Debug from 'debug';
let Joi = require('joi');

let debug = Debug('repository_monitor:pushlog_client');
let ITERATE_CHUNKS = 10;

export default class PushlogClient {
  constructor() {
    let agentOpts = {
      // Use much longer keep alives since we primarily talk to one host.
      keepAliveMsecs: 10 * 1000,
      keepAlive: true,
      maxSockets: 256
    };

    this.httpAgent = new HttpAgent(agentOpts);
    this.httpsAgent = new HttpsAgent(agentOpts);
  }

  selectAgent(url) {
    if (url.startsWith('https://')) {
      return this.httpsAgent;
    }
    return this.httpAgent;
  }

  /**
  The pushlog format by default is not convenient to iterate over in ascending
  order of pushes. This function formats the body;


  Normally the format would be something like this:

  {
    lastpushid: 5,
    pushes: {
      5: { ... },
      4: { ... },
      3: { ... },
      2: { ... },
      1: { ... },
      0: { ... }
    }
  }

  Format converts this to:

  {
    lastPushId: 5,
    pushes: [
      { id: 0, ...  },
     ...
    ]
  }

  */
  async formatBody(body) {
    let pushes = [];
    let result = {
      lastPushId: body.lastpushid
    };

    let range = Object.keys(body.pushes).map((v) => {
      return Number(v);
    }).sort((a, b) => {
      // Custom sort because JS default implementation does not sort numbers in
      // a descending order!
      return a - b;
    });

    result.pushes = range.map((id) => {
      let push = Object.assign({}, body.pushes[id]);
      push.id = Number(id);
      return push;
    });

    // Just because we requested all possible value does not mean they get
    // returned so we keep track of the range and attach that to the body.
    result.range = { start: range[0], end: range[range.length -1] };
    return result;
  }

  /**
  Issue a get request for a particular repository
  */
  async get(url, start=0, end=1) {
    Joi.assert(url, Joi.string().required(), 'must pass url');
    debug('get', url, start, end);
    let pushUrl = urljoin(url, '/json-pushes/');
    let req = request.
                get(pushUrl).
                agent(this.selectAgent(url)).
                query({ version: 2, full: 1, startID: start, endID: end });

    let res = await req.end();
    if (res.error) throw res.error;
    return this.formatBody(res.body);
  }

  async getOne(url, id) {
    let res = await this.get(url, id - 1, id);
    return res.pushes[0];
  }

  /**
  Iterate through all pushlog entires in chunks to not overload server.

  @param {String} url where repository lives at.
  @param {Number} start id to use (exclusive)
  @param {Number} end id to use (inclusive)
  @param {Function} fn async function to invoke.
  */
  async iterate(url, start=0, end=1, fn) {
    if (start > end) {
      throw new Error(`Start must be < then end : ${start} < ${end}`);
    }

    let remainder = end - start;
    let chunks = Math.ceil(remainder / ITERATE_CHUNKS);

    for (let chunk = 0; chunk < chunks; chunk++) {
      let startID = start + (ITERATE_CHUNKS * chunk);
      let endID = Math.min(startID + ITERATE_CHUNKS, end);
      debug('iterate', { url, startID, endID });
      let res = await this.get(url, startID, endID);

      if (startID > res.lastPushId) {
        // Edge case where we request beyond the actual available pushes...
        return;
      }


      for (let push of res.pushes) {
        await fn(push);
      }
    }
  }
}
