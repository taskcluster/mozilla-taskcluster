import assert from 'assert';
import * as subject from '../src/project_scopes';

suite('project scopes', function() {

  let config = {
    defaultScopes: ['woot'],
    defaultUrl: '{{{host}}} {{{path}}} {{{revision}}} {{{alias}}}',
    projects: {
      defaults: {},
      withScopes: {
        scopes: ['custom']
      },
      withUrl: {
        url: 'custom-url {{path}}'
      }
    }
  };

  test('#scopes', function() {
    assert.equal(
      subject.scopes(config, 'defaults'),
      config.defaultScopes
    );

    assert.equal(
      subject.scopes(config, 'withScopes'),
      config.projects.withScopes.scopes
    );
  });

  test('unknown project', function() {
    try {
      subject.scopes(config, 'thefoo!');
    } catch (e) {
      assert.ok(e);
      assert.ok(e.message.indexOf('Unknown') !== -1);
      return;
    }
    throw new Error('Expected an error...');
  });

  test('#url', function() {
    let params = {
      alias: 'alias',
      revision: 'revision',
      path: 'path',
      host: 'host'
    };

    assert.equal(
      subject.url(config, 'defaults', params),
      'host path revision alias'
    );

    assert.equal(
      subject.url(config, 'withUrl', params),
      'custom-url path'
    );
  });


});
