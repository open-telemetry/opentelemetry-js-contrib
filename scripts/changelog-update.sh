#!/bin/bash

echo "
## $1
" > delete_me.txt
npx lerna-changelog | sed '1,3d' >> delete_me.txt
sed -i -e '/## Unreleased/r delete_me.txt' CHANGELOG.md
rm delete_me.txt
