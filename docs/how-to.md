---
title: How-Tos
order: 50
---

# Repository Changes

**NOTE:** Changes should be coordinated such that the access controls at
`hg.mozilla.org` are always more restrictive than those configured in
mozilla-taskcluster.  For example, when raising a repo from level 2 to level 3,
make the change in `hg.mozilla.org` first.  Likewise when lowering a repo from
level 3 to level 2, make the change in mozilla-taskcluster first. This avoids a
situation where a user with level-2 credentials could trigger level-3 tasks.

## Adding a Repository

To add a repository from mozilla-taskcluster, first ensure that the repository
is configured in Treeherder, as this is the data source from which repositories
are imported.  Also ensure that the repository is listed in
[production-branches.json](https://hg.mozilla.org/build/tools/raw-file/default/buildfarm/maintenance/production-branches.json)
and has `features['taskcluster-push'] = true`.

Alternately, if it is not a Gecko repository, ensure that it is configured in
`src/config/default.yml`.

Then, run the repository importer:

    heroku run -a mozilla-taskcluster repository_importer production

In the Heroku UI, check that the repository now appears in the "Repositories"
collection in Mongo.

Finally, restart all Heroku dynos to load the new configuration.

## Removing a Repository

The process for removing a repository is similar. Ensure that the repository is
no longer configured, either removing it from `src/config/default.yml`, setting
`features['taskcluster-push'] = false` in `production-branches.json`, or
removing it from that file entirely.  Then remove the row manually from the
Mongo DB using the Heroku UI.

Finish by restarting the Heroku dynos.

## Resetting a Repository

"Twig" repositories are often "reset", meaning that their pushlog ID is set
back to some smaller value.  Figure out what this value is now  by looking at
the "push id" in the tip changeset, for example [on this
page](https://hg.mozilla.org/projects/oak/rev/tip) for oak.  Then use the
Heroku UI to set the `lastPushId` row in the Repositories table to that value.

Note that mozilla-taskcluster polls this table frequently, and will happily
schedule jobs for all pushes from `lastPushId` to the current push ID in the
repository.  Coordinate changes so that the repository's push ID is modified
first!

## Changing Repository Level

When a repository's level is changed, ideally both `production-branches.json`
and the `hg.mozilla.org` configuration are changed simultaneously. To load that
updated configuration in mozilla-taskcluster, simply restart all Herkou dynos.

