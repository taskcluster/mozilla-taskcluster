import assert from 'assert';
import Joi from 'joi';
import {
  duplicate as duplicateTask,
  TOP_LEVEL_DATES
} from '../../src/taskcluster/duplicate_task';

suite('duplicate task', function() {

  const initalDate = new Date(2010, 0, 1);
  const DEADLINE = 3600;


  function getTask(overrides = {}) {
    let task = {
      provisionerId:  'not-a-real-provisioner',
      schedulerId:    'task-graph-scheduler',
      workerType:     'test',
      created:        initalDate.toJSON(),
      deadline:       new Date(initalDate.getTime() + DEADLINE).toJSON(),
      routes: [],
      payload: {},
      metadata: {
        name:         'Example Task name',
        description:  'Markdown description of **what** this task does',
        owner:        'user@example.com',
        source:       'http://docs.taskcluster.net/tools/task-creator/'
      }
    }

    return Object.assign(task, overrides);
  }

  test('no payload', function() {
    let task = getTask();
    let now = new Date(2010, 0, 2);
    let duplicate = duplicateTask(task, now);

    assert.ok(!duplicate.expires, 'does not add extra fields');

    // Ensure all properties match...
    for (let prop in task) {
      if (TOP_LEVEL_DATES.indexOf(prop) !== -1) continue;
      assert.deepEqual(duplicate[prop], task[prop], prop);
    }

    Joi.assert(
      duplicate,
      Joi.object().keys({
        created: Joi.string().required().valid(now.toJSON()),
        deadline: Joi.string().required().valid(new Date(
          now.valueOf() + DEADLINE
        ).toJSON())
      }).unknown(true)
    );
  });

  test('payload with artifacts', function() {
    let artifactOneTime = 60 * 1000 * 20;
    let artifactTwoTime = 60 * 1000 * 5;

    let task = getTask({
      payload: {
        artifacts: {
          one: {
            expires: new Date(initalDate.valueOf() + artifactOneTime).toJSON(),
          },
          two: {
            expires: new Date(initalDate.valueOf() + artifactTwoTime).toJSON(),
          },
          three: {}
        }
      }
    });

    let now = new Date(2010, 0, 2);
    let duplicate = duplicateTask(task, now);

    Joi.assert(
      duplicate.payload.artifacts,
      Joi.object().keys({
        one: Joi.object().keys({
          expires: Joi.string().valid(new Date(artifactOneTime + now.valueOf()).toJSON())
        }),
        two: Joi.object().keys({
          expires: Joi.string().valid(new Date(artifactTwoTime + now.valueOf()).toJSON())
        }),
        three: Joi.object()
      })
    );
  });

});
