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
# Adds a "has:owner-approval" label to a PR if a reviewer who approved it is a component owner.

set -euo pipefail

if [[ -z "${REPO:-}" || -z "${PR:-}" ]]; then
    echo "One or more of REPO and PR have not been set. Please ensure each is set."
    exit 0
fi

main () {
    CUR_DIRECTORY=$(dirname "$0")

    # The latestReviews key returns the latest review for each reviewer cutting out any other reviews.
    JSON=$(gh pr view "${PR}" --json "files,author,latestReviews" | tr -dc '[:print:]' | sed -E 's/\\[a-z]//g')
    FILES=$(echo -n "${JSON}"| jq -r '.files[].path')
    LATEST_REVIEWS=$(echo -n "${JSON}" | jq -c '.latestReviews')

    # Fetch components
    COMPONENTS=$(bash "${CUR_DIRECTORY}/get-components.sh" | tac) # Reversed so we visit subdirectories first
    
    declare -A PROCESSED_COMPONENTS

    for COMPONENT in ${COMPONENTS}; do
        COMPONENT_OWNERS=$(COMPONENT="${COMPONENT}" bash "${CUR_DIRECTORY}/get-codeowners.sh")

        for FILE in ${FILES}; do
            MATCH=$(echo -n "${FILE}" | grep -E "^${COMPONENT}" || true)

            if [[ -z "${MATCH}" ]]; then
                continue
            fi

            # If we match a file with a component, skip further processing for this file
            if [[ -v PROCESSED_COMPONENTS["${COMPONENT}"] ]]; then
                continue
            fi
            PROCESSED_COMPONENTS["${COMPONENT}"]=true

            # Check if updated file is owned by one of the reviewers"
            echo "${LATEST_REVIEWS}" | jq -c '.[]' | while IFS= read -r REVIEW; do
                REVIEW_AUTHOR=$(echo -n "${REVIEW}"| jq -r '.author.login')
                REVIEW_STATE=$(echo -n "${REVIEW}"| jq -r '.state')
                if [[ "${REVIEW_STATE}" == "APPROVED" ]]; then
                    # Review is approved. Checking if reviewer is a component owner
                    for OWNER in ${COMPONENT_OWNERS}; do
                        if [[ "${REVIEW_AUTHOR}" == "${OWNER}" ]]; then
                            echo "Reviewer $REVIEW_AUTHOR is a component owner. Adding 'has:owner-approval' label."
                            gh pr edit "${PR}" --repo "${REPO}" --add-label "has:owner-approval"
                            exit 0
                        fi
                    done
                fi
            done
        done
    done
}

# Ensure the script does not block a PR even if it fails
main || echo "Failed to run $0"
