import db from '../src/db';
import uuid from 'uuid';

export default function setup(collection) {
  let connection, subject, dbName = uuid.v4();
  suiteSetup(async function() {
    this.connection = new db.Connection(
      dbName,
      this.config.documentdb.host,
      { masterKey: this.config.documentdb.key }
    );
  });

  suiteTeardown(async function() {
    await this.connection.destroy();
  });
}
