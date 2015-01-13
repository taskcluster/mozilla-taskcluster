#! /bin/bash

set -ex
DEBUG=* node.exe $WEBROOT_PATH/build/bin/pushlog_monitor.js $CONFIG_TYPE
