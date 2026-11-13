/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  azureAppServiceDetector,
  azureContainerAppsDetector,
  azureFunctionsDetector,
} from '../../src';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE } from '../../src/types';
import {
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_HOST_ID,
  ATTR_SERVICE_INSTANCE_ID,
} from '../../src/semconv';
import { detectResources } from '@opentelemetry/resources';

describe('AzureAppServiceDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
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
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], 'test-owner-name');
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      'test-resource-group'
    );
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

  it('should parse account id from owner name', () => {
    process.env.WEBSITE_SITE_NAME = 'test-site';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';
    process.env.WEBSITE_OWNER_NAME =
      'test-subscription-id+test-resource-group-WestEuropewebspace';

    const resource = detectResources({
      detectors: [azureFunctionsDetector, azureAppServiceDetector],
    });
    const attributes = resource.attributes;
    assert.strictEqual(
      attributes[ATTR_CLOUD_ACCOUNT_ID],
      'test-subscription-id'
    );
    assert.strictEqual(
      attributes['cloud.resource_id'],
      `/subscriptions/test-subscription-id/resourceGroups/${process.env.WEBSITE_RESOURCE_GROUP}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}`
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
    delete process.env.WEBSITE_RESOURCE_GROUP;

    const resource = detectResources({
      detectors: [
        azureFunctionsDetector,
        azureAppServiceDetector,
        azureContainerAppsDetector,
      ],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], 'test-owner-name');
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      undefined
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
      detectors: [
        azureFunctionsDetector,
        azureAppServiceDetector,
        azureContainerAppsDetector,
      ],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], undefined);
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      'test-resource-group'
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
    assert.strictEqual(attributes['cloud.resource_id'], undefined);
  });
});
