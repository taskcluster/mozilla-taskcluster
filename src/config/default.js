// This file is here only so Joi can fill in the blanks of 
// sub objects... See defaults in src/config.js
export default {
  documentdb: {
    database: 'treeherder-proxy-testing',
  },
  treeherder: {},
  kue: {
    admin: {}
  },
  redis: {},
  repositoryMonitor: {}
}
