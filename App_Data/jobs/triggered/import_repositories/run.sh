#! /bin/bash

set -ex
DEBUG=* node.exe $WEBROOT_PATH/build/bin/import_repositories.js $CONFIG_TYPE


