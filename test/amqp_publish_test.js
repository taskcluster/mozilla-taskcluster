import assert from 'assert';
import amqpPublish from './amqp_publish';
import eventToPromise from 'event-to-promise';

suite('amqp_publish', function() {

  test('publish message', async function() {
    let payload = { now: Date.now(), amazing: true };
    let msg = {
      exchange: 'testmexfoo',
      routing: 'woot.bar',
      payload
    };

    // Send initial message to ensure we have exchange setup...
    await amqpPublish(this.config, msg);

    await this.listener.bind({
      exchange: 'testmexfoo',
      routingKeyPattern: '#'
    });

    await this.listener.resume();

    let [gotMsg] = await Promise.all([
      eventToPromise(this.listener, 'message'),
      amqpPublish(this.config, msg)
    ]);

    assert.deepEqual(gotMsg.payload, payload);
    assert.equal(gotMsg.routingKey, msg.routing);
    assert.equal(gotMsg.exchange, msg.exchange);
  });
});
