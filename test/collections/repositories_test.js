import db from '../../src/db';
import * as Joi from 'joi';
import uuid from 'uuid';
import assert from 'assert';

import collectionSetup from '../collection';
import Repositories from '../../src/collections/repositories';

suite('collections/repositories', function() {
  collectionSetup(Repositories);

  let subject;
  setup(function() {
    subject = new Repositories(this.connection);
  });

  test('create()', async function() {
    let url = 'https://hg.mozilla.org/wootbar';
    let expected = Repositories.hashUrl(url);
    assert.ok(expected, 'returns hash');

    let doc = { url, alias: 'wootbar' };

    let create = await subject.create(doc);
    let found = await subject.findById(expected);
    assert.equal(create.lastPushId, 0);
    assert.equal(found._self, create._self);
  });
});

