#! /bin/bash

echo 'starting .... do things!'
set -ex
export DEBUG=*
node.exe $WEBROOT_PATH/build/bin/import_repositories.js $CONFIG_TYPE
