import db from '../src/db';
import uuid from 'uuid';

export default function setup(collection) {
  let connection, subject;
  let start = Date.now();
  suiteSetup(async function() {
    this.connection = new db.Connection(
      this.config.documentdb.database,
      this.config.documentdb.host,
      {
        masterKey: this.config.documentdb.key
      }
    );
  });

  suiteTeardown(async function() {
    await this.connection.destroy();
  });
}
