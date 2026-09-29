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
import {
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_FAAS_INSTANCE,
  ATTR_FAAS_MAX_MEMORY,
  ATTR_PROCESS_PID,
  ATTR_SERVICE_INSTANCE_ID,
} from '../../src/semconv';
import { detectResources } from '@opentelemetry/resources';
import {
  AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE,
  AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE,
} from '../../src/types';

describe('AzureFunctionsDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
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
      detectors: [
        azureFunctionsDetector,
        azureAppServiceDetector,
        azureContainerAppsDetector,
      ],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_SERVICE_NAME], 'test-service');
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], 'test-owner-name');
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      'test-resource-group'
    );
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.functions');
    assert.strictEqual(attributes[ATTR_CLOUD_REGION], 'test-region');
    assert.strictEqual(attributes[ATTR_FAAS_INSTANCE], 'test-instance-id');
    assert.strictEqual(attributes[ATTR_FAAS_MAX_MEMORY], '1000');

    // Should not detect app service values
    assert.strictEqual(attributes[ATTR_SERVICE_INSTANCE_ID], undefined);
    assert.strictEqual(attributes[ATTR_PROCESS_PID], process.pid);

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
      detectors: [
        azureFunctionsDetector,
        azureAppServiceDetector,
        azureContainerAppsDetector,
      ],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(
      attributes[ATTR_CLOUD_ACCOUNT_ID],
      expectedWebsiteOwnerName
    );
    assert.strictEqual(
      attributes['cloud.resource_id'],
      `/subscriptions/${expectedWebsiteOwnerName}/resourceGroups/${process.env.WEBSITE_RESOURCE_GROUP}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}`
    );
  });

  it('should omit the resource group attribute when its environment variable is missing', () => {
    process.env.WEBSITE_SITE_NAME = 'test-service';
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.WEBSITE_OWNER_NAME = 'test-owner-name';
    delete process.env.WEBSITE_RESOURCE_GROUP;

    const resource = detectResources({ detectors: [azureFunctionsDetector] });
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_SERVICE_NAME], 'test-service');
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], 'test-owner-name');
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      undefined
    );
  });

  it('should omit the account id when its environment variable is missing', () => {
    process.env.WEBSITE_SITE_NAME = 'test-service';
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.WEBSITE_RESOURCE_GROUP = 'test-resource-group';
    delete process.env.WEBSITE_OWNER_NAME;

    const resource = detectResources({ detectors: [azureFunctionsDetector] });
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_SERVICE_NAME], 'test-service');
    assert.strictEqual(attributes[ATTR_CLOUD_ACCOUNT_ID], undefined);
    assert.strictEqual(
      attributes[AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE],
      'test-resource-group'
    );
  });

  describe('faas.instance', () => {
    const detectFunctionInstance = (instanceEnv: {
      WEBSITE_INSTANCE_ID?: string;
      WEBSITE_POD_NAME?: string;
      CONTAINER_NAME?: string;
    }) => {
      process.env.WEBSITE_SITE_NAME = 'test-service';
      process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
      delete process.env.WEBSITE_INSTANCE_ID;
      delete process.env.WEBSITE_POD_NAME;
      delete process.env.CONTAINER_NAME;
      Object.assign(process.env, instanceEnv);

      const resource = detectResources({ detectors: [azureFunctionsDetector] });
      return resource.attributes[ATTR_FAAS_INSTANCE];
    };

    it('should use WEBSITE_INSTANCE_ID alone', () => {
      assert.strictEqual(
        detectFunctionInstance({ WEBSITE_INSTANCE_ID: 'test-instance-id' }),
        'test-instance-id'
      );
    });

    it('should use WEBSITE_POD_NAME alone', () => {
      assert.strictEqual(
        detectFunctionInstance({ WEBSITE_POD_NAME: 'test-pod-name' }),
        'test-pod-name'
      );
    });

    it('should use CONTAINER_NAME alone', () => {
      assert.strictEqual(
        detectFunctionInstance({ CONTAINER_NAME: 'test-container-name' }),
        'test-container-name'
      );
    });

    it('should prefer WEBSITE_INSTANCE_ID over WEBSITE_POD_NAME and CONTAINER_NAME', () => {
      assert.strictEqual(
        detectFunctionInstance({
          WEBSITE_INSTANCE_ID: 'test-instance-id',
          WEBSITE_POD_NAME: 'test-pod-name',
          CONTAINER_NAME: 'test-container-name',
        }),
        'test-instance-id'
      );
    });

    it('should prefer WEBSITE_POD_NAME over CONTAINER_NAME', () => {
      assert.strictEqual(
        detectFunctionInstance({
          WEBSITE_POD_NAME: 'test-pod-name',
          CONTAINER_NAME: 'test-container-name',
        }),
        'test-pod-name'
      );
    });

    it('should skip empty values', () => {
      assert.strictEqual(
        detectFunctionInstance({
          WEBSITE_INSTANCE_ID: '',
          WEBSITE_POD_NAME: 'test-pod-name',
          CONTAINER_NAME: 'test-container-name',
        }),
        'test-pod-name'
      );
      assert.strictEqual(
        detectFunctionInstance({
          WEBSITE_INSTANCE_ID: '',
          WEBSITE_POD_NAME: '',
          CONTAINER_NAME: 'test-container-name',
        }),
        'test-container-name'
      );
    });

    it('should omit the attribute when all values are empty', () => {
      assert.strictEqual(
        detectFunctionInstance({
          WEBSITE_INSTANCE_ID: '',
          WEBSITE_POD_NAME: '',
          CONTAINER_NAME: '',
        }),
        undefined
      );
    });

    it('should omit the attribute when none are set', () => {
      assert.strictEqual(detectFunctionInstance({}), undefined);
    });
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
    detectors: [
      azureFunctionsDetector,
      azureAppServiceDetector,
      azureContainerAppsDetector,
    ],
  });
  assert.ok(resource);
  const attributes = resource.attributes;
  assert.strictEqual(attributes[ATTR_SERVICE_NAME], 'test-service');
  assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');

  // Should not detect app service values
  assert.strictEqual(attributes[ATTR_SERVICE_INSTANCE_ID], undefined);
  assert.strictEqual(attributes[ATTR_PROCESS_PID], process.pid);
  delete process.env.WEBSITE_SKU;
});
