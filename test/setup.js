import * as documentdb from 'documentdb';
import loadConfig from '../src/config';

suiteSetup(async function() {
  this.config = await loadConfig('test.js');
});
