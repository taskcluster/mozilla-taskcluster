#! /bin/bash -ex
./test/circleci.js
./node_modules/.bin/mocha --reporter spec $@
