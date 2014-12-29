# treeherder-proxy

Hopefully temporary proxy to treeherder which handles request backlog and emits events on pushes.

## Developing

Development can be setup locally but the intended environment is fig.

Here are a few examples:

```sh
fig run test /bin/bash

# The app is now volume mounted to /app and redis, etc.. is setup

./node_modules/.bin/mocha test/<file>_test.js
```
