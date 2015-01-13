import taskcluster from 'taskcluster-client';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import slugid from 'slugid';
import Debug from 'debug';

import {
  default as instantiate,
  parseTime,
  relativeTime
} from '../../src/try/instantiate'

let debug = Debug('test:try:instantiate');

suite('instantiate', function() {
  test('parseTime 1 day', function() {
    assert.equal(parseTime('1d').days, 1);
    assert.equal(parseTime('1 d').days, 1);
    assert.equal(parseTime('1 day').days, 1);
    assert.equal(parseTime('1 days').days, 1);
    assert.equal(parseTime('1day').days, 1);
    assert.equal(parseTime('1    d').days, 1);
    assert.equal(parseTime('  1    day   ').days, 1);
    assert.equal(parseTime('  1 days   ').days, 1);
  });

  test('parseTime 3 days', function() {
    assert.equal(parseTime('3d').days, 3);
    assert.equal(parseTime('3 d').days, 3);
    assert.equal(parseTime('3 day').days, 3);
    assert.equal(parseTime('3 days').days, 3);
    assert.equal(parseTime('3day').days, 3);
    assert.equal(parseTime('3    d').days, 3);
    assert.equal(parseTime('  3    day   ').days, 3);
    assert.equal(parseTime('  3 days   ').days, 3);
  });

  test('parseTime 45 hours', function() {
    assert.equal(parseTime('45h').hours, 45);
    assert.equal(parseTime('45 h').hours, 45);
    assert.equal(parseTime('45 hour').hours, 45);
    assert.equal(parseTime('45 hours').hours, 45);
    assert.equal(parseTime('45hours').hours, 45);
    assert.equal(parseTime('45    h').hours, 45);
    assert.equal(parseTime('  45    hour   ').hours, 45);
    assert.equal(parseTime('  45 hours   ').hours, 45);
  });

  test('parseTime 45 min', function() {
    assert.equal(parseTime('45m').minutes, 45);
    assert.equal(parseTime('45 m').minutes, 45);
    assert.equal(parseTime('45 min').minutes, 45);
    assert.equal(parseTime('45 minutes').minutes, 45);
    assert.equal(parseTime('45minutes').minutes, 45);
    assert.equal(parseTime('45    m').minutes, 45);
    assert.equal(parseTime('  45    min   ').minutes, 45);
    assert.equal(parseTime('  45 minutes   ').minutes, 45);
  });

  test('parseTime 2d3h6m', function() {
    assert.equal(parseTime('2d3h6m').days, 2);
    assert.equal(parseTime('2d3h6m').hours, 3);
    assert.equal(parseTime('2d3h6m').minutes, 6);
    assert.equal(parseTime('2d3h').minutes, 0);
    assert.equal(parseTime('2d0h').hours, 0);
  });

  test('relativeTime', function() {
    let d1 = new Date();
    let d2 = new Date(d1.getTime());
    d2.setHours(d1.getHours() + 2);
    let d3 = relativeTime(parseTime('2 hours'), d1);
    assert(d3.getTime() === d2.getTime(), "Wrong date");
  });

  test('instantiate task-graph.yml', async function() {
    // Load input file
    let input = fs.readFileSync(
      path.join(__dirname, '..', 'fixtures', 'try', 'task_graph.yml'), {
      encoding: 'utf8'
    });

    let params = {
      owner:         'user@example.com',
      source:        'http://localhost/unit-test',
      comment:       "try: something...",
      project:       "try",
      revision:      'REVISION',
      revision_hash: 'RESULTSET',
      pushlog_id:    '1',
      url: 'http://xfoobar.com'
    };
    let taskGraph = instantiate(input, Object.assign(
      { importScopes: true },
      params
    ));


    // Do a little smoke testing
    assert(taskGraph.metadata);
    assert(taskGraph.metadata.owner === 'user@example.com');
    assert(taskGraph.tasks[0].task.routes.indexOf('xyz.try.RESULTSET') !== -1);
    assert(taskGraph.tasks.length === 3);
    assert(taskGraph.tasks[1].taskId === taskGraph.tasks[2].requires[0]);

    assert.deepEqual(taskGraph.tasks[0].task.extra, params);

    // Create taskGraphId
    let taskGraphId = slugid.v4();
    debug("Creating taskGraphId: %s", taskGraphId);
    await this.scheduler.createTaskGraph(taskGraphId, taskGraph);
  });
});


