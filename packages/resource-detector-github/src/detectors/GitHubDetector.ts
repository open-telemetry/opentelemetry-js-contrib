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
 * The GitHubDetector can be used to detect GitHub Actions environment variables
 * and returns resource attributes with GitHub-specific metadata that exists
 * in GitHub Actions environments.
 *
 * More information about GitHub Action environment variables is available here:
 * https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
 */
class GitHubDetector implements ResourceDetector {
  detect(): DetectedResource {
    const attributes = {
      'github.workflow': process.env.GITHUB_WORKFLOW || undefined,
      'github.run_id': process.env.GITHUB_RUN_ID || undefined,
      'github.run_number': process.env.GITHUB_RUN_NUMBER || undefined,
      'github.actor': process.env.GITHUB_ACTOR || undefined,
      'github.sha': process.env.GITHUB_SHA || undefined,
      'github.ref': process.env.GITHUB_REF || undefined,
      'github.head_ref': process.env.GITHUB_HEAD_REF || undefined,
      'github.base_ref': process.env.GITHUB_BASE_REF || undefined,
    };
    return { attributes };
  }
}

export const gitHubDetector = new GitHubDetector();
