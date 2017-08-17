---
title: Pushlog Monitoring
order: 40
---

The [pushlog_monitor](./src/bin/pushlog_monitor.js) is responsible for
converting pushlog entries into treeherder resultsets this process
closely mirrors the logic treeherder itself uses but is duplicated here
to ensure that the moment we notice a push we create a resultset and the
associated graph.

The Repositories collection in MongoDB contains the list of monitored
repositories Note that this only is supported for repositories which live
under the hg.mozilla.org/* host with the pushlog extension.

Other configuration for repositories is automatically loaded from
[production-branches.json](https://hg.mozilla.org/build/tools/raw-file/default/buildfarm/maintenance/production-branches.json)
on startup.
