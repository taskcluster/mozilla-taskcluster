export default {
  kue: {
    prefix: 'test'
  },

  documentdb: {
    database: 'treeherder-proxy-testing',
  },

  treeherder: {
    credentials: JSON.stringify(require('../../test/fixtures/treeherder.json'))
  },

  redis: {},

  repositoryMonitor: {
    interval: 1000,
    maxPushFetches: 100
  },

  commitPublisher: {
    title: `(Test) Commits`,
    description: `...`,
    exchangePrefix: 'tests/'
  }
}
