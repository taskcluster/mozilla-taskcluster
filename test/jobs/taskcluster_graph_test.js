import assert from 'assert';
import slugid from 'slugid';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import taskcluster from 'taskcluster-client';
import fs from 'mz/fs';
import yaml from 'js-yaml';

suite('jobs/taskcluster_graph', function() {
  let monitorSetup = testSetup('workers.js');
  let changeset = slugid.v4();

  suiteSetup(async function() {
    let content =
      await fs.readFile(__dirname + '/../fixtures/try/decision.yml');

    let path =
      `/raw-file/${changeset}/testing/taskcluster/tasks/decision/try.yml`;

    monitorSetup.pushlog.route({
      method: 'GET',
      path: path,
      handler: (request, reply) => {
        reply(content);
      }
    });
  });

  test('update after a push', async function() {
    let changesets = [
      {
       author: 'Author <user@domain.com>',
       branch: 'default',
       desc: 'desc',
       files: [
        'xfoobar'
       ],
       node: slugid.v4(),
       tags: []
      },
      {
       author: 'user@example.com',
       branch: 'default',
       desc: 'try: desc +tc',
       files: [
        'xfoobar'
       ],
       node: changeset,
       tags: []
      },
    ];

    let lastChangeset = changesets[changesets.length - 1];
    let schedulerEvents = new taskcluster.SchedulerEvents();
    let queueEvents = new taskcluster.QueueEvents();

    await this.pulse.connect();
    let route = `route.testme.try.${lastChangeset.node}`
    this.pulse.bind(queueEvents.taskPending(route));

    monitorSetup.pushlog.push(changesets);

    await this.pulse.resume();
    // Consume the queue now that the event has been sent...
    let [ message ] = await Promise.all([
      eventToPromise(this.pulse, 'message'),
      this.pulse.resume()
    ]);

    let queue = new taskcluster.Queue();
    let task = await queue.getTask(message.payload.status.taskId);
    assert.equal(task.routes[0], route.replace('route.', ''));
  });
});

