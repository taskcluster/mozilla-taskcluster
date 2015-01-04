export default {
  kue: {
    prefix: 'test'
  },

  redis: {
    host: 'redis'
  },

  commitPublisher: {
    title: `(Test) Commits`,
    description: `...`,
    connectionString: `amqp://rabbitmq:5672`,
    exchangePrefix: 'tests'
  }
}
