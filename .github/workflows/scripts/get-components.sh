#!/usr/bin/env bash
#
# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0
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