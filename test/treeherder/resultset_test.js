import createResultset from '../../src/treeherder/resultset';
import { readdirSync } from 'fs';
import assert from 'assert';

const FIXTURE_PREFIX = __dirname + '/../fixtures/pushes/';
const FIXTURES = readdirSync(FIXTURE_PREFIX);

suite('test fixtures', function() {
  for (let revisionHash of FIXTURES) {
    let changesets = require(`${FIXTURE_PREFIX}/${revisionHash}/push.json`);
    let push = {
      date: Date.now() / 1000,
      author: 'me',
      changesets
    }

    test(`generate ${revisionHash}`, function() {
      let result = createResultset('try', push);
      assert.equal(result.revision_hash, revisionHash);

      assert.equal(result.author, push.author);

      let expectedChangesets = changesets.map((c) => {
        return {
          revision: c.node.slice(0, 12),
          files: c.files,
          author: c.author,
          branch: c.branch,
          comment: c.desc,
          repository: 'try'
        }
      });

      assert.deepEqual(result.revisions, expectedChangesets);
    });
  }
});
