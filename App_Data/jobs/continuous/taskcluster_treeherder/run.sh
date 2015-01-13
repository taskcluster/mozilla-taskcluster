#! /bin/bash

set -ex
DEBUG=* node.exe $WEBROOT_PATH/build/bin/taskcluster_treeherder.js $CONFIG_TYPE

