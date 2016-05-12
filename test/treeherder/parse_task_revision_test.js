import assert from 'assert';
import { parseTaskRevisionHash } from '../../src/treeherder/job_handler';

suite('parse task revision', () => {
  test('v1 route', () => {
    let prefix = 'treeherder-test';
    let task = {
      routes: [
        `${prefix}.mozilla-inbound.abc`,
        `${prefix}-stage.mozilla-inbound.def`,
        'build.mozilla-inbound.ghi'
      ]
    };
    let revisionInfo = parseTaskRevisionHash(task, prefix);
    assert.deepEqual(revisionInfo, ["", "abc"]);
  });

  test('v2 route preference or v1', () => {
    let prefix = 'treeherder-test';
    let task = {
      routes: [
        `${prefix}.mozilla-inbound.abc`,
        `${prefix}.v2.mozilla-inbound.def`,
        'build.mozilla-inbound.ghi'
      ]
    };
    let revisionInfo = parseTaskRevisionHash(task, prefix);
    assert.deepEqual(revisionInfo, ["def", ""]);
  });

  test('task revision info preference over routes', () => {
    let prefix = 'treeherder-test';
    let task = {
      routes: [
        `${prefix}.mozilla-inbound.abc`,
        `${prefix}.v2.mozilla-inbound.def`,
        'build.mozilla-inbound.ghi'
      ],
      extra: {
        treeherder: {
          revision: 'xyz',
          revision_hash: 'tuv'
        }
      }
    };
    let revisionInfo = parseTaskRevisionHash(task, prefix);
    assert.deepEqual(revisionInfo, ["xyz", "tuv"]);
  });

  test('empty revision information when no match', () => {
    let prefix = 'treeherder-test';
    let task = {
      routes: [
        `${prefix}1.mozilla-inbound.abc`,
        `${prefix}1.v2.mozilla-inbound.def`,
        'build.mozilla-inbound.ghi'
      ]
    };
    let revisionInfo = parseTaskRevisionHash(task, prefix);
    assert.deepEqual(revisionInfo, ["", ""]);
  });
});
