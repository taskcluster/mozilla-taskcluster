import assert from 'assert';
import load from '../src/config';

suite('config', function() {
  test('load base test config', async function() {
    // note that this does not test loading from mongo, local files, or production-branches
    await load('test');
  });
});
