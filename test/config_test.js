import assert from 'assert';
import load from '../src/config';

suite('config', function() {
  test('load base test config', async function() {
    // note that this does not test loading from mongo, local files, or production-branches
    await load('test');
  });

  test('load test config with production-branches.yml', async function() {
    // this uses a fixed revision and expects specific values.  If the format changes,
    // this will need to be updated to a new revision.
    let config = await load('test', {
      overrides: {
        config: {
         productionBranchesUrl: 'https://hg.mozilla.org/build/tools/raw-file/63085f07948c/buildfarm/maintenance/production-branches.json',
        },
      }
    });

    assert.equal(config.try.projects['try'].level, 1);
    assert.equal(config.try.projects['try'].scopes[0], 'assume:repo:hg.mozilla.org/try:*');
    assert.equal(config.try.projects['mozilla-beta'].level, 3);
    assert.equal(config.try.projects['mozilla-beta'].scopes[0], 'assume:repo:hg.mozilla.org/releases/mozilla-beta:*');
    assert.equal(config.try.projects['testbranch'].level, 7);
    assert.equal(config.try.projects['testbranch'].scopes[0], 'xyz');
  });
});
