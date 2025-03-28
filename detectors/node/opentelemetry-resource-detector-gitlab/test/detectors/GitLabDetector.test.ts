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

import * as assert from 'assert';
import * as sinon from 'sinon';

import { detectResources } from '@opentelemetry/resources';

import { gitLabDetector } from '../../src/detectors';

describe('GitLabResourceDetector', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    process.env.GITLAB_USER_EMAIL = '';
    process.env.GITLAB_USER_ID = '';
    process.env.CI_PROJECT_PATH = '';
    process.env.CI_COMMIT_REF_NAME = '';
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME = '';
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = '';
    process.env.CI_MERGE_REQUEST_IID = '';
    process.env.CI_PIPELINE_ID = '';
    process.env.CI_PIPELINE_SOURCE = '';
    process.env.CI_COMMIT_SHA = '';
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should successfully return gitlab resource data', async () => {
    process.env.GITLAB_USER_EMAIL = 'foo@bar';
    process.env.GITLAB_USER_ID = '42';
    process.env.CI_PROJECT_PATH = 'foo/bar';
    process.env.CI_COMMIT_REF_NAME = 'git-ref';
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME = 'ref/foo';
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = 'ref/bar';
    process.env.CI_MERGE_REQUEST_IID = '1';
    process.env.CI_PIPELINE_ID = '424242';
    process.env.CI_PIPELINE_SOURCE = 'merge_request';
    process.env.CI_COMMIT_SHA = 'git-sha';

    const resource = detectResources({ detectors: [gitLabDetector] });

    assert.ok(resource);
    assert.deepStrictEqual(resource.attributes, {
      'gitlab.user_email': 'foo@bar',
      'gitlab.user_id': '42',
      'gitlab.project_path': 'foo/bar',
      'gitlab.ref': 'git-ref',
      'gitlab.source': 'ref/foo',
      'gitlab.target': 'ref/bar',
      'gitlab.mr_iid': '1',
      'gitlab.pipeline_id': '424242',
      'gitlab.pipeline_source': 'merge_request',
      'gitlab.commit_sha': 'git-sha',
    });
  });

  it('should return empty resource when no GitLab env vars exists', async () => {
    const resource = detectResources({ detectors: [gitLabDetector] });

    assert.ok(resource);
    assert.deepStrictEqual(resource.attributes, {});
  });
});
