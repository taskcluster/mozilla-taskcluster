import assert from 'assert';
import parseRoute from '../../src/util/route_parser';

suite('parse task revision', () => {
  test('v1 route', () => {
    let route = 'treeherder-test.mozilla-inbound.abc';
    let revisionInfo = parseRoute(route);
    assert.deepEqual(revisionInfo, {project: 'mozilla-inbound', revisionHash: 'abc'});
  });

  test('v2 route', () => {
    let route = 'treeherder-test.v2.mozilla-inbound.def';
    let revisionInfo = parseRoute(route);
    assert.deepEqual(revisionInfo, {project: 'mozilla-inbound', revision: 'def'});
  });

  test('v2 github route', () => {
    let route = 'treeherder-test.v2.mozilla/b2g.def';
    let revisionInfo = parseRoute(route);
    assert.deepEqual(revisionInfo, {project: 'b2g', revision: 'def'});
  });
});
