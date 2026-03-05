#!/bin/bash

# Copyright The OpenTelemetry Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# `npm run ...`, but only run it on the "affected" workspaces,
# according to `nx show projects --affected`.
#
# Dev Note: This script exists because `nx affected ...` does not,
# AFAIK, have an option to exclude all the extra nx-y output. I just
# want the output from those `npm run` commands. `npm run` has `-s`,
# `nx affected` does not.

if [ "$TRACE" != "" ]; then
    export PS4='${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

TOP=$(cd $(dirname $0)/../ >/dev/null; pwd)

affected=$($TOP/node_modules/.bin/nx show projects --affected)
if [[ -z "$affected" ]]; then
  exit 0
fi

npmCmd="npm run"
while read ws; do
  npmCmd="$npmCmd -w $ws"
done <<< "$affected"

$npmCmd "$@"
