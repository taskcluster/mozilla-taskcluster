/**
Helper used to duplicate a single task definition.
*/

import merge from 'lodash.merge';

// Task level date objects to update...
export const TOP_LEVEL_DATES = [
  'expires',
  'created',
  'deadline'
];

function updateDateWithDelta(original, delta) {
  // parse date and add the delta...
  let date = new Date((new Date(original)).valueOf() + delta);
  // we want the json friendly output for the tasks..
  return date.toJSON();
}

export function duplicate(task, now) {
  let newTask = merge({}, task);

  // let now be configurable for tests...
  now = now || new Date();

  // Calculate delta so we keep same relative durations/etc...
  let originalCreated = new Date(task.created);
  let delta = now - originalCreated;

  // Top level dates...
  for (let field of TOP_LEVEL_DATES) {
    if (!(field in newTask)) continue;
    newTask[field] = updateDateWithDelta(task[field], delta);
  }

  // Task group id should never be duplicated... The scheduler can assign a new
  // one once the graph is created...
  delete newTask.taskGroupId;

  // docker-worker specific dates...
  if (task.payload && typeof task.payload.artifacts === 'object') {
    Object.keys(task.payload.artifacts).forEach((name) => {
      let artifact = newTask.payload.artifacts[name];
      // Only update this if it has an expires property...
      if (!artifact.expires) return;
      artifact.expires = updateDateWithDelta(artifact.expires, delta);
    });
  }

  return newTask;
}
