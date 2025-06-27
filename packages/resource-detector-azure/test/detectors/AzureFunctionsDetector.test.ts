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
import { azureAppServiceDetector } from '../../src/detectors/AzureAppServiceDetector';
import {
  SEMRESATTRS_CLOUD_PLATFORM,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_REGION,
  SEMRESATTRS_FAAS_INSTANCE,
  SEMRESATTRS_FAAS_MAX_MEMORY,
  SEMRESATTRS_PROCESS_PID,
  SEMRESATTRS_SERVICE_INSTANCE_ID,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { detectResources } from '@opentelemetry/resources';
import { AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE } from '../../src/types';

describe('AzureFunctionsDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = process.env;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should test functions values', () => {
    process.env.WEBSITE_SITE_NAME = 'test-service';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.WEBSITE_MEMORY_LIMIT_MB = '1000';
    process.env.WEBSITE_OWNER_NAME = 'test-owner-name';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';

    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[SEMRESATTRS_SERVICE_NAME], 'test-service');
    assert.strictEqual(attributes[SEMRESATTRS_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(
      attributes[SEMRESATTRS_CLOUD_PLATFORM],
      'azure_functions'
    );
    assert.strictEqual(attributes[SEMRESATTRS_CLOUD_REGION], 'test-region');
    assert.strictEqual(
      attributes[SEMRESATTRS_FAAS_INSTANCE],
      'test-instance-id'
    );
    assert.strictEqual(attributes[SEMRESATTRS_FAAS_MAX_MEMORY], '1000');

    // Should not detect app service values
    assert.strictEqual(attributes[SEMRESATTRS_SERVICE_INSTANCE_ID], undefined);
    assert.strictEqual(attributes[SEMRESATTRS_PROCESS_PID], process.pid);

    assert.strictEqual(
      attributes['cloud.resource_id'],
      `/subscriptions/${process.env.WEBSITE_OWNER_NAME}/resourceGroups/${process.env.WEBSITE_RESOURCE_GROUP}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}`
    );
    assert.strictEqual(
      attributes[AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE],
      undefined
    );
  });

  it('should get the correct cloud resource id when WEBSITE_OWNER_NAME has a +', () => {
    process.env.WEBSITE_SITE_NAME = 'test-service';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.WEBSITE_MEMORY_LIMIT_MB = '1000';
    process.env.WEBSITE_OWNER_NAME = 'test-owner-name+test-subscription-id';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';

    const expectedWebsiteOwnerName = 'test-owner-name';
    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(
      attributes['cloud.resource_id'],
      `/subscriptions/${expectedWebsiteOwnerName}/resourceGroups/${process.env.WEBSITE_RESOURCE_GROUP}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}`
    );
  });
});

it('should detect azure functions if websiteSku is defined as FlexConsumption', () => {
  assert.ok(!process.env.WEBSITE_SKU && !process.env.FUNCTIONS_VERSION);
  process.env.WEBSITE_SITE_NAME = 'test-service';
  process.env.REGION_NAME = 'test-region';
  process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
  process.env.WEBSITE_SKU = 'FlexConsumption';
  process.env.WEBSITE_MEMORY_LIMIT_MB = '1000';
  process.env.WEBSITE_OWNER_NAME = 'test-owner-name';
  process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';

  const resource = detectResources({
    detectors: [azureFunctionsDetector, azureAppServiceDetector],
  });
  assert.ok(resource);
  const attributes = resource.attributes;
  assert.strictEqual(attributes[SEMRESATTRS_SERVICE_NAME], 'test-service');
  assert.strictEqual(attributes[SEMRESATTRS_CLOUD_PROVIDER], 'azure');

  // Should not detect app service values
  assert.strictEqual(attributes[SEMRESATTRS_SERVICE_INSTANCE_ID], undefined);
  assert.strictEqual(attributes[SEMRESATTRS_PROCESS_PID], process.pid);
  delete process.env.WEBSITE_SKU;
});
