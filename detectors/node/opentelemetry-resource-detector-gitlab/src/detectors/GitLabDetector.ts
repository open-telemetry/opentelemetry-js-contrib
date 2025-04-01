/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';

/**
 * The GitLabDetector can be used to detect GitLab CI environment variables
 * and returns resource attributes with GitLab-specific metadata that exists
 * in GitLab CI  environments.
 *
 * More information about GitLab CI environment variables is available here:
 * https://docs.gitlab.com/ci/variables/predefined_variables
 */
class GitLabDetector implements ResourceDetector {
  detect(): DetectedResource {
    const attributes = {
      'gitlab.user_email': process.env.GITLAB_USER_EMAIL || undefined,
      'gitlab.user_id': process.env.GITLAB_USER_ID || undefined,
      'gitlab.project_path': process.env.CI_PROJECT_PATH || undefined,
      'gitlab.ref': process.env.CI_COMMIT_REF_NAME || undefined,
      'gitlab.source': process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || undefined,
      'gitlab.target': process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || undefined,
      'gitlab.mr_iid': process.env.CI_MERGE_REQUEST_IID || undefined,
      'gitlab.pipeline_id': process.env.CI_PIPELINE_ID || undefined,
      'gitlab.pipeline_source': process.env.CI_PIPELINE_SOURCE || undefined,
      'gitlab.commit_sha': process.env.CI_COMMIT_SHA || undefined,
    };
    return { attributes };
  }
}

export const gitLabDetector = new GitLabDetector();
