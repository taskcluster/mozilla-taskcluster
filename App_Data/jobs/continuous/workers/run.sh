#! /bin/bash

set -ex
DEBUG=* node.exe $WEBROOT_PATH/build/bin/workers.js $CONFIG_TYPE

