#!/bin/bash

for path in $(cat lerna.json | jq '.packages[]'); do
  base=$(sed 's/"//g' <<< $path)  # Remove quotes
  for package in $base; do
    if [ -d $package ]; then
      echo Publishing to NPM: $package
      pushd $package
      npm publish
      popd
    fi
  done
done
