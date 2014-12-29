import * as documentdb from 'documentdb';
import loadConfig from '../src/config';
import loadRuntime from '../src/runtime';

suiteSetup(async function() {
  this.config = await loadConfig('test.js');
  this.runtime = await loadRuntime(this.config);
});
