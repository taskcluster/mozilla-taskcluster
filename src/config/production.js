export default {
  documentdb: {
    database: 'treeherder-proxy-production',
  },

  treeherderTaskcluster: {
    routePrefix: 'tc-treeherder'
  },

  kue: {
    prefix: 'production',
    admin: {
      port: 60024
    }
  }
};
