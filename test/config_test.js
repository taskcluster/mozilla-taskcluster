import assert from 'assert';
import load from '../src/config';

suite('config', function() {
  test('load base test config', async function() {
    // note that this does not test loading from mongo, local files, or production-branches
    await load('test');
  });

  test('load test config with projects.yml', async function() {
    // this uses a fixed revision and expects specific values.  If the format changes,
    // this will need to be updated to a new revision.
    let config = await load('test', {
      overrides: {
        config: {
          projectsYmlUrl: 'https://hg.mozilla.org/build/ci-configuration/raw-file/94ebf429be75/projects.yml',
        },
      }
    });

    assert.equal(config.try.projects['try'].level, 1);
    assert.equal(config.try.projects['try'].scopes[0], 'assume:repo:hg.mozilla.org/try:branch:default');
    assert.equal(config.try.projects['mozilla-beta'].level, 3);
    assert.equal(config.try.projects['mozilla-beta'].scopes[0], 'assume:repo:hg.mozilla.org/releases/mozilla-beta:branch:default');
    assert.equal(config.try.projects['testbranch'].level, 7);
    assert.equal(config.try.projects['testbranch'].scopes[0], 'xyz');
  });
});
