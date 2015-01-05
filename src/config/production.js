export default {
  documentdb: {
    database: 'treeherder-proxy-production',
  },

  kue: {
    prefix: 'production',
    admin: {
      port: 60024
    }
  }
};
