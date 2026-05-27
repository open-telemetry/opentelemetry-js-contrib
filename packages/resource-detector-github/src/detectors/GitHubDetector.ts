/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
  public detect(): DetectedResource {
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
