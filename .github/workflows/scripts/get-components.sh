#!/usr/bin/env bash
#
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
#
# Gets the components from the component_owners.yml file.


# Define the file path
YML_FILE=".github/component_owners.yml"

# Parse the YAML file and extract components and their owners
while IFS= read -r line; do
    # Check if the line contains a component (ends with ':')
    if [[ "$line" =~ ^[[:space:]]*[^#]+: ]]; then
        # Extract the component name (remove leading spaces and trailing ':')
        COMPONENT=$(echo "$line" | sed -E 's/^[[:space:]]*([^:]+):.*/\1/')
        echo "$COMPONENT"
    fi
done < "$YML_FILE"
