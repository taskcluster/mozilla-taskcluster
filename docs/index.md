# Mozilla Taskcluster

## Developing

Development can be setup locally but the intended environment is fig.

Here are a few examples:

```sh
fig run test /bin/bash

# The app is now volume mounted to /app and redis, etc.. is setup

./node_modules/.bin/mocha test/<file>_test.js
```

## Post-Depoyment Verification

After deploying a new version of mozilla-taskcluster, ensure that pushes are still be reported to Treeherder and job statuses are updated.  One can do this by viewing a repo in Treeherder and waiting for a push, or if more immediate results are necessary a push to 'try' could be performed.  Decision tasks should appear for the push which should be enough to verify that the pushlog is being polled, resultsets created in Treeherder, and job statuses are updated. 

Further information can be found in Papertrail and heroku logs.  Errors are reported when the pushlog monitor polling failed, or if a resultset or taskgraph cannot be created.  Searching events in Papertrail for 'mozilla-taskcluster' and the string 'error' should be sufficient.
