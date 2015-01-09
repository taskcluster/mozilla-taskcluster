// This file is here only so Joi can fill in the blanks of 
// sub objects... See defaults in src/config.js

import yaml from 'js-yaml';
import fs from 'fs';

// Import default repositories config.
const TRY_CONFIG = `${__dirname}/../../repositories.yml`;

export default {
  documentdb: {},
  treeherder: {},
  treeherderProxy: {},
  kue: {
    admin: {}
  },
  try: yaml.safeLoad(fs.readFileSync(TRY_CONFIG, 'utf8'), {
    filename: TRY_CONFIG
  }),
  redis: {},
  repositoryMonitor: {}
}
