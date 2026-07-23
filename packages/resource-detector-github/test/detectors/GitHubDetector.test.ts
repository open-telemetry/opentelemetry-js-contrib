/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

import { detectResources } from '@opentelemetry/resources';

import { gitHubDetector } from '../../src/detectors';
import {
  ATTR_CICD_PIPELINE_NAME,
  ATTR_CICD_PIPELINE_RUN_ID,
  ATTR_VCS_REF_BASE_NAME,
  ATTR_VCS_REF_HEAD_NAME,
  ATTR_VCS_REF_HEAD_REVISION,
} from '../../src/semconv';

describe('GitHubResourceDetector', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    process.env.GITHUB_WORKFLOW = '';
    process.env.GITHUB_RUN_ID = '';
    process.env.GITHUB_RUN_NUMBER = '';
    process.env.GITHUB_ACTOR = '';
    process.env.GITHUB_SHA = '';
    process.env.GITHUB_REF = '';
    process.env.GITHUB_HEAD_REF = '';
    process.env.GITHUB_BASE_REF = '';
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should successfully return github resource data', async () => {
    process.env.GITHUB_WORKFLOW = 'workflow-foo';
    process.env.GITHUB_RUN_ID = 'run-id-foo';
    process.env.GITHUB_RUN_NUMBER = '42';
    process.env.GITHUB_ACTOR = 'octocat';
    process.env.GITHUB_SHA = 'git-sha';
    process.env.GITHUB_REF = 'refs/pull/1/merge';
    process.env.GITHUB_HEAD_REF = 'ref/foo';
    process.env.GITHUB_BASE_REF = 'ref/bar';

    const resource = detectResources({ detectors: [gitHubDetector] });

    assert.ok(resource);
    assert.deepStrictEqual(resource.attributes, {
      [ATTR_CICD_PIPELINE_NAME]: 'workflow-foo',
      [ATTR_CICD_PIPELINE_RUN_ID]: 'run-id-foo',
      [ATTR_VCS_REF_HEAD_NAME]: 'ref/foo',
      [ATTR_VCS_REF_HEAD_REVISION]: 'git-sha',
      [ATTR_VCS_REF_BASE_NAME]: 'ref/bar',
      'github.run_number': '42',
      'github.actor': 'octocat',
    });
  });

  it('should fall back to GITHUB_REF for the head ref name outside of pull requests', async () => {
    process.env.GITHUB_WORKFLOW = 'workflow-foo';
    process.env.GITHUB_SHA = 'git-sha';
    process.env.GITHUB_REF = 'refs/heads/main';

    const resource = detectResources({ detectors: [gitHubDetector] });

    assert.ok(resource);
    assert.deepStrictEqual(resource.attributes, {
      [ATTR_CICD_PIPELINE_NAME]: 'workflow-foo',
      [ATTR_VCS_REF_HEAD_NAME]: 'refs/heads/main',
      [ATTR_VCS_REF_HEAD_REVISION]: 'git-sha',
    });
  });

  it('should return empty resource when no GitHub env vars exists', async () => {
    const resource = detectResources({ detectors: [gitHubDetector] });

    assert.ok(resource);
    assert.deepStrictEqual(resource.attributes, {});
  });
});
