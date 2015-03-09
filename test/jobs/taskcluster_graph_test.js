import assert from 'assert';
import slugid from 'slugid';
import eventToPromise from 'event-to-promise';
import waitFor from '../wait_for';
import testSetup from '../monitor';
import taskcluster from 'taskcluster-client';
import fs from 'mz/fs';
import yaml from 'js-yaml';

// XXX: This value comes from configs we should fetch it from there somehow.
const GRAPH_PATH = 'testing/taskcluster/tasks/decision/try.yml'

suite('jobs/taskcluster_graph', function() {
  let monitorSetup = testSetup('workers.js');

  test('update after a push', async function() {
    let graph =
      await fs.readFile(__dirname + '/../fixtures/try/decision.yml', 'utf8');

    // Write the first commit... Note that the graph is added here but it does
    // not matter where it is added...
    await monitorSetup.hg.write(GRAPH_PATH, graph);
    await monitorSetup.hg.commit();

    // Write the second commit with the try flags...
    await monitorSetup.hg.write('README', 'bla')
    await monitorSetup.hg.commit('try: desc +tc');

    // Fetch the cset which contains our push...
    let hgLog = await monitorSetup.hg.log();
    let lastChangeset = hgLog[0].node;

    let schedulerEvents = new taskcluster.SchedulerEvents();
    let queueEvents = new taskcluster.QueueEvents();

    // Setup the listeners prior to the push to ensure we don't have any races.
    await this.pulse.connect();
    let route = `route.test.try.${lastChangeset}`
    this.pulse.bind(queueEvents.taskPending(route));

    // Actually push our changes...
    await monitorSetup.hg.push();

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

