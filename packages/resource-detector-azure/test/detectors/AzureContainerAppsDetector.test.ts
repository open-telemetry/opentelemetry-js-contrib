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
import { azureContainerAppsDetector } from '../../src/detectors/AzureContainerAppsDetector';
import { detectResources } from '@opentelemetry/resources';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CONTAINER_NAME,
  ATTR_HOST_ID,
  ATTR_HOST_NAME,
  ATTR_SERVICE_INSTANCE_ID,
} from '../../src/semconv';
import { AZURE_CONTAINER_APPS_REVISION } from '../../src/types';

describe('AzureContainerAppsDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    // Clear Container Apps env vars before each test
    delete process.env.CONTAINER_APP_NAME;
    delete process.env.CONTAINER_APP_REVISION;
    delete process.env.CONTAINER_APP_HOSTNAME;
    delete process.env.CONTAINER_APP_ENV_DNS_SUFFIX;
    delete process.env.CONTAINER_APP_PORT;
    delete process.env.CONTAINER_APP_REPLICA_NAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect Azure Container Apps resource attributes', () => {
    process.env.CONTAINER_APP_NAME = 'test-container-app';
    process.env.CONTAINER_APP_REVISION = 'test-revision';
    process.env.CONTAINER_APP_HOSTNAME = 'test-hostname';
    process.env.CONTAINER_APP_ENV_DNS_SUFFIX = 'eastus.azurecontainerapps.io';
    process.env.CONTAINER_APP_PORT = '8080';
    process.env.CONTAINER_APP_REPLICA_NAME = 'test-replica-name';

    const resource = detectResources({
      detectors: [azureContainerAppsDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.container_apps');
    assert.strictEqual(attributes[ATTR_CONTAINER_NAME], 'test-container-app');
    assert.strictEqual(attributes[ATTR_HOST_ID], 'test-hostname');
    assert.strictEqual(
      attributes[ATTR_HOST_NAME],
      'test-container-app.eastus.azurecontainerapps.io'
    );
    assert.strictEqual(
      attributes[ATTR_SERVICE_INSTANCE_ID],
      'test-replica-name'
    );
    assert.strictEqual(
      attributes[AZURE_CONTAINER_APPS_REVISION],
      'test-revision'
    );
  });

  it('should return empty attributes when not running on Azure Container Apps', () => {
    delete process.env.CONTAINER_APP_NAME;
    delete process.env.CONTAINER_APP_REVISION;
    delete process.env.CONTAINER_APP_HOSTNAME;
    delete process.env.CONTAINER_APP_ENV_DNS_SUFFIX;
    delete process.env.CONTAINER_APP_PORT;
    delete process.env.CONTAINER_APP_REPLICA_NAME;

    const resource = detectResources({
      detectors: [azureContainerAppsDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], undefined);
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], undefined);
    assert.strictEqual(attributes[ATTR_CONTAINER_NAME], undefined);
    assert.strictEqual(attributes[ATTR_HOST_ID], undefined);
    assert.strictEqual(attributes[ATTR_HOST_NAME], undefined);
    assert.strictEqual(attributes[ATTR_SERVICE_INSTANCE_ID], undefined);
    assert.strictEqual(attributes[AZURE_CONTAINER_APPS_REVISION], undefined);
  });

  it('should return empty attributes when only some env vars are set', () => {
    process.env.CONTAINER_APP_NAME = 'test-container-app';
    process.env.CONTAINER_APP_REVISION = 'test-revision';
    // Missing other required env vars
    delete process.env.CONTAINER_APP_HOSTNAME;
    delete process.env.CONTAINER_APP_ENV_DNS_SUFFIX;
    delete process.env.CONTAINER_APP_PORT;
    delete process.env.CONTAINER_APP_REPLICA_NAME;

    const resource = detectResources({
      detectors: [azureContainerAppsDetector],
    });
    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], undefined);
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], undefined);
  });
});
