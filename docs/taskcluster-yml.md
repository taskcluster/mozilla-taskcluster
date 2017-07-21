---
title: .taskcluster.yml
---

When a push occurs on a monitored repository, the service looks for a
`.taskcluster.yml` in the root of the repository at the pushed commit. That
file is read as a YAML document, rendered with
[JSON-e](https://github.com/taskcluster/json-e), and then used to create the
resulting tasks.

## File Versions

Every template must contain a top-level property `version: 1`. This is
consulted before the JSON-e rendering takes place.

There was a version 0 template format, but it was undocumented and was not
valid YAML.  We shall speak of it no more.

## JSON-e Rendering

The entire YAML file is rendered using
[JSON-e](https://github.com/taskcluster/json-e). The following context
variables are provided:

```js
{
  // tasks_for (string) - always 'hg-push' for mozilla-taskcluster (this is to
  // distinguish from other tools that might read the same template, such as
  // taskcluster-github)
  tasks_for: 'hg-push',

  push: {
    // push.owner (string) - the hg user that made the push (not always an email)
    owner: '..',

    // push.revision (string) - long hg revision hash
    revision: '..',

    // push.comment (string) - commit comment from the last commit in the push
    comment: '..'

    // push.pushlog_id (number) - id of this push in the hg pushlog; see
    // http://mozilla-version-control-tools.readthedocs.io/en/latest/hgmo/pushlog.html#writing-agents-that-consume-pushlog-data
    pushlog_id: ..,

    // push.pushdate (number) - epoch timestamp when this push occurred
    pushdate: ..,
  },

  repository: {
    // repo.url (string) - repository root URL
    url: '..',

    // repo.project (string) - alias for this repository
    project: '..',

    // repo.level (number) - SCM level for this repo
    level: ..,
  },

  // now (string) - the current time, useful for reproducible $fromNow invocations
  now: '..',

  // as_slugid (function) - given a label, generate a slugid.  Multiple calls with the
  // same label in the same push will generate the same slugiid, but different slugids
  // in different pushes.  Use this to generate taskIds, etc.
  as_slugid: function(label) { .. },
}
```

The repository information comes from the [mozilla-taskcluster
configuration](https://github.com/taskcluster/mozilla-taskcluster/blob/master/src/config/default.yml).

## Result

After rendering, the resulting document should have a `tasks` property
containing a list of task definitions. Each task definition should match the [task
schema](https://docs.taskcluster.net/reference/platform/taskcluster-queue/docs/task-schema)
as it will be passed nearly unchanged to `Queue.createTask`, The exception is
that the provided task definition must contain a `taskId` field, which the
service will remove and pass to `Queue.createTask` directly.

## Scopes

Each repository has a corresponding set of scopes defined in the [mozilla-taskclutser
configuration](https://github.com/taskcluster/mozilla-taskcluster/blob/master/src/config/default.yml).

Tasks generated from pushes to a repository are limited to the repository's
scopes.  That is, the repository's configured scopes must
[satisfy](https://docs.taskcluster.net/manual/design/apis/hawk/scopes) the
scopes of every task defined in `.taskcluster.yml`.
