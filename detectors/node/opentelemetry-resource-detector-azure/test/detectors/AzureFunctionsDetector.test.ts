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
import { azureFunctionsDetector } from '../../src/detectors/AzureFunctionsDetector';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

describe('AzureFunctionsDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = process.env;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should test functions values', () => {
    process.env.WEBSITE_SITE_NAME = 'test-function';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.WEBSITE_MEMORY_LIMIT_MB = '1000';

    const resource = azureFunctionsDetector.detect();
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(
      attributes[SemanticResourceAttributes.FAAS_NAME],
      'test-function'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.CLOUD_PROVIDER],
      'azure'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.CLOUD_PLATFORM],
      'azure_functions'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.CLOUD_REGION],
      'test-region'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.FAAS_INSTANCE],
      'test-instance-id'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.FAAS_MAX_MEMORY],
      '1000'
    );
    assert.strictEqual(
      attributes[SemanticResourceAttributes.FAAS_VERSION],
      '~4'
    );
  });
});
