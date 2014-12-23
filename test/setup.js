import * as documentdb from 'documentdb';
import loadConfig from '../src/config';

suiteSetup(async function() {
  let config = await loadConfig('test.js');
  this.documentdb = new documentdb.DocumentClient(config.documentdb.host, {
    masterKey: config.documentdb.key
  })
});
