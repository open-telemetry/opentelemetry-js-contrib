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
# Gets the owners for a given component from the component_owners.yml file.

# Define the file path
YML_FILE=".github/component_owners.yml"

if [[ -z "${COMPONENT:-}" ]]; then
    echo "COMPONENT has not been set, please ensure it is set."
    exit 1
fi

FOUND=0

# Parse the YAML file and extract owners for the given component
while IFS= read -r line; do
    # Check if the line matches the given component
    if [[ "$line" =~ ^[[:space:]]*${COMPONENT}:[[:space:]]*$ ]]; then
        FOUND=1
        continue
    fi

    # If the component is found, extract owners
    if [[ $FOUND -eq 1 ]]; then
        # Stop if we encounter another component or an empty line
        if [[ "$line" =~ ^[[:space:]]*[^#]+: || -z "$line" ]]; then
            break
        fi

        # Extract the owner (remove leading spaces and '- ')
        if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*[^#]+ ]]; then
            OWNER=$(echo "$line" | sed -E 's/^[[:space:]]*-[[:space:]]*([^#]+).*/\1/')
            echo "$OWNER"
        fi
    fi
done < "$YML_FILE"
