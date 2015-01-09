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

  redis: {
    host: 'redis'
  },

  repositoryMonitor: {
    interval: 100,
    maxPushFetches: 100
  },

  commitPublisher: {
    title: `(Test) Commits`,
    description: `...`,
    connectionString: `amqp://rabbitmq:5672`,
    exchangePrefix: 'tests/'
  }
}
