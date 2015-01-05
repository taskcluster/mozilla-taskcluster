export default {
  kue: {
    prefix: 'test'
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
