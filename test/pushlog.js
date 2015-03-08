import Hapi from 'hapi';
import denodeify from 'denodeify';

// Default number of recent pushes to return if no arguments passed..
const DEFAULT_PUSHES = 10;

function intOrUndefined(n) {
  if (typeof n === 'string') return parseInt(n, 10);
  return n;
}

class Pushlog {
  constructor(server) {
    let server = new Hapi.Server({
      debug: { request: ['hapi'] }
    });

    server.connection({ port: 0 });
    server.route({
      method: 'GET',
      path: '/json-pushes/',
      handler: this.pushlog.bind(this)
    });

    this.server = server;
    this.lastpushid = -1;
    this.pushes = {};
    this.push();
  }

  route(config) {
    this.server.route(config);
  }

  push(changesets={}, date=new Date(), user="xfoo@bar.com") {
    let push = this.pushes[++this.lastpushid] = {};
    push.changesets = changesets;
    push.date = date || new Date()
    push.date = (new Date(push.date).valueOf()) / 1000;
    push.user = user;
    return this;
  }

  async pushlog(request, reply) {
    let response = { lastpushid: this.lastpushid }
    let pushes = {};

    let endID = intOrUndefined(request.query.endID) || this.lastpushid;
    let startID = intOrUndefined(request.query.startID);
    let full = !!request.query.full || false;

    if (!startID) {
      startID = endID - DEFAULT_PUSHES;
      if (startID < 0) {
        startID = 0;
      }
    }

    // Original logic of how this should work is documented at:
    // http://mozilla-version-control-tools.readthedocs.org/en/latest/hgmo/pushlog.html
    for (let pushid = startID + 1; pushid <= endID; pushid++) {
      if (!(pushid in this.pushes)) continue;
      // Do not return the actual record only a shallow clone...
      let pushDetails = Object.assign({}, this.pushes[pushid]);
      pushes[pushid] = pushDetails;

      // If full was not requested flatten the changesets into just the node.
      if (!full) {
        pushes[pushid].changesets = pushDetails.changesets.map((v) => {
          return v.node;
        });
      }

    }

    reply({ lastpushid: this.lastpushid, pushes });
  }

  async start() {
    await denodeify(this.server.start.bind(this.server))();
    this.url = `http://localhost:${this.server.info.port}`
  }

  async stop() {
    return await denodeify(this.server.stop.bind(this.server))();
  }
}

export default async function() {
  let server = new Pushlog();
  await server.start();
  return server;
}
