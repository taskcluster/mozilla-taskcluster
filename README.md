# Mozilla Taskcluster

Mozilla-Taskcluster is responsible for monitoring https://hg.mozilla.org and
creating tasks when changes are committed.

It has historically also been responsible for some task-related actions such as
retriggering, and for submitting task information to treeherder.  Retriggering
is being replaced with an in-tree action, while treeherder submission has been
replaced by the Taskcluster-treeherder service.

The Taskcluster team is slowly removing responsibilities from
mozilla-taskcluster, and will shut it down once it is no longer used.  In the
interim, it is not being actively developed, although it is being maintained
and patched as necessary.
