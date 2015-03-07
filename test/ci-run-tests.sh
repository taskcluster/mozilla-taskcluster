#! /bin/bash -ex
# Ensure tests always start with clean configs...
rm -f ./test/config.yml
./test/circleci.js
./node_modules/.bin/mocha --reporter spec --grep '@ci-skip' --invert $@
