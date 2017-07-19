---
title: Pushlog Monitoring
---

The [pushlog_monitor](./src/bin/pushlog_monitor.js) is responsible for
converting pushlog entries into treeherder resultsets this process
closely mirrors the logic treeherder itself uses but is duplicated here
to ensure that the moment we notice a push we create a resultset and the
associated graph.

The Repositories collection contains the list of monitored repositories
(Note that this only is supported for repositories which live under the
hg.mozilla.org/* host with the pushlog extension.

