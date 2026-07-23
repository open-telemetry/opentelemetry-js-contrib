/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';

import {
  ATTR_CICD_PIPELINE_NAME,
  ATTR_CICD_PIPELINE_RUN_ID,
  ATTR_VCS_REF_BASE_NAME,
  ATTR_VCS_REF_HEAD_NAME,
  ATTR_VCS_REF_HEAD_REVISION,
} from '../semconv';

/**
 * The GitHubDetector can be used to detect GitHub Actions environment variables
 * and returns resource attributes with GitHub-specific metadata that exists
 * in GitHub Actions environments.
 *
 * More information about GitHub Action environment variables is available here:
 * https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
 */
class GitHubDetector implements ResourceDetector {
  public detect(): DetectedResource {
    // GITHUB_HEAD_REF is only set for pull request events, where GITHUB_REF
    // holds the synthetic merge ref instead of the branch being merged.
    const headRef = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF;

    const attributes = {
      [ATTR_CICD_PIPELINE_NAME]: process.env.GITHUB_WORKFLOW || undefined,
      [ATTR_CICD_PIPELINE_RUN_ID]: process.env.GITHUB_RUN_ID || undefined,
      [ATTR_VCS_REF_HEAD_NAME]: headRef || undefined,
      [ATTR_VCS_REF_HEAD_REVISION]: process.env.GITHUB_SHA || undefined,
      [ATTR_VCS_REF_BASE_NAME]: process.env.GITHUB_BASE_REF || undefined,
      // Semconv has no equivalent for these two yet.
      'github.run_number': process.env.GITHUB_RUN_NUMBER || undefined,
      'github.actor': process.env.GITHUB_ACTOR || undefined,
    };
    return { attributes };
  }
}

export const gitHubDetector = new GitHubDetector();
