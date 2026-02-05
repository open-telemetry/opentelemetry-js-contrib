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
import { azureAksDetector } from '../../src/detectors/AzureAksDetector';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_K8S_CLUSTER_NAME,
} from '../../src/semconv';
import { CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE } from '../../src/types';
import { detectResources } from '@opentelemetry/resources';

describe('AzureAksDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect AKS environment from CLUSTER_RESOURCE_ID environment variable', () => {
    process.env.CLUSTER_RESOURCE_ID =
      '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-aks-cluster';

    const resource = detectResources({
      detectors: [azureAksDetector],
    });

    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.aks');
    assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'test-aks-cluster');
    assert.strictEqual(
      attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
      '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-aks-cluster'
    );
  });

  it('should extract cluster name from resource ID with different casing', () => {
    process.env.CLUSTER_RESOURCE_ID =
      '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/ManagedClusters/my-cluster-name';

    const resource = detectResources({
      detectors: [azureAksDetector],
    });

    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.aks');
    assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'my-cluster-name');
  });

  it('should return empty resource when not in AKS environment', () => {
    delete process.env.CLUSTER_RESOURCE_ID;

    const resource = detectResources({
      detectors: [azureAksDetector],
    });

    assert.ok(resource);
    const attributes = resource.attributes;
    assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], undefined);
    assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], undefined);
    assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], undefined);
    assert.strictEqual(
      attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
      undefined
    );
  });
});
