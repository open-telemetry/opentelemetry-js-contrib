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
import { azureAppServiceDetector } from '../../src/detectors/AzureAppServiceDetector';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_HOST_ID,
  ATTR_SERVICE_INSTANCE_ID,
} from '../../src/semconv';
import { azureFunctionsDetector } from '../../src';
import { detectResources } from '@opentelemetry/resources';

describe('AzureAppServiceDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = process.env;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should test on appService', () => {
    process.env.WEBSITE_SITE_NAME = 'test-site';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_SLOT_NAME = 'test-slot';
    process.env.WEBSITE_HOSTNAME = 'test-hostname';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.WEBSITE_HOME_STAMPNAME = 'test-home-stamp';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';
    process.env.WEBSITE_OWNER_NAME = 'test-owner-name';

    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_SERVICE_NAME], 'test-site');
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.app_service');
    assert.strictEqual(
      attributes['cloud.resource_id'],
      `/subscriptions/${process.env.WEBSITE_OWNER_NAME}/resourceGroups/${process.env.WEBSITE_RESOURCE_GROUP}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}`
    );
    assert.strictEqual(attributes[ATTR_CLOUD_REGION], 'test-region');
    assert.strictEqual(
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME],
      'test-slot'
    );
    assert.strictEqual(attributes[ATTR_HOST_ID], 'test-hostname');
    assert.strictEqual(
      attributes[ATTR_SERVICE_INSTANCE_ID],
      'test-instance-id'
    );
    assert.strictEqual(
      attributes['azure.app.service.stamp'],
      'test-home-stamp'
    );
  });

  it('should test with no resource group', () => {
    process.env.WEBSITE_SITE_NAME = 'test-site';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_SLOT_NAME = 'test-slot';
    process.env.WEBSITE_HOSTNAME = 'test-hostname';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.WEBSITE_HOME_STAMPNAME = 'test-home-stamp';
    process.env.WEBSITE_OWNER_NAME = 'test-owner-name';

    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_REGION], 'test-region');
    assert.strictEqual(
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME],
      'test-slot'
    );
    assert.strictEqual(attributes[ATTR_HOST_ID], 'test-hostname');
    assert.strictEqual(
      attributes[ATTR_SERVICE_INSTANCE_ID],
      'test-instance-id'
    );
    assert.strictEqual(
      attributes['azure.app.service.stamp'],
      'test-home-stamp'
    );
  });

  it('should test with no owner name', () => {
    process.env.WEBSITE_SITE_NAME = 'test-site';
    process.env.REGION_NAME = 'test-region';
    process.env.WEBSITE_SLOT_NAME = 'test-slot';
    process.env.WEBSITE_HOSTNAME = 'test-hostname';
    process.env.WEBSITE_INSTANCE_ID = 'test-instance-id';
    process.env.WEBSITE_HOME_STAMPNAME = 'test-home-stamp';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';
    delete process.env.WEBSITE_OWNER_NAME;

    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_REGION], 'test-region');
    assert.strictEqual(
      attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME],
      'test-slot'
    );
    assert.strictEqual(attributes[ATTR_HOST_ID], 'test-hostname');
    assert.strictEqual(
      attributes[ATTR_SERVICE_INSTANCE_ID],
      'test-instance-id'
    );
    assert.strictEqual(
      attributes['azure.app.service.stamp'],
      'test-home-stamp'
    );
    assert.strictEqual(attributes['cloud.resource_id'], undefined);
  });
});
