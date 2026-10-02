/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { azureAksDetector } from '../../src/detectors/AzureAksDetector';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_K8S_CLUSTER_NAME,
} from '../../src/semconv';
import {
  AKS_METADATA_FILE_PATH,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
} from '../../src/types';
import { detectResources } from '@opentelemetry/resources';

const TEST_RESOURCE_ID =
  '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-aks-cluster';

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

  describe('mounted ConfigMap', () => {
    let fixtureRoot: string;
    let metadataPath: string;
    const originalFs = {
      statSync: fs.statSync,
      existsSync: fs.existsSync,
      readFileSync: fs.readFileSync,
    };

    // The detector reads a hard coded path, so redirect just that path onto a
    // real temporary fixture. Everything else keeps hitting the real filesystem.
    // Paths are normalized first so this also works on Windows, where path.join
    // rewrites the POSIX constant with backslashes.
    const normalizedRoot = path.normalize(AKS_METADATA_FILE_PATH);

    function redirect(candidate: fs.PathLike): fs.PathLike {
      const asString = path.normalize(String(candidate));
      if (!asString.startsWith(normalizedRoot)) {
        return candidate;
      }
      return path.join(metadataPath, asString.slice(normalizedRoot.length));
    }

    beforeEach(() => {
      delete process.env.CLUSTER_RESOURCE_ID;
      fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aks-metadata-'));
      metadataPath = path.join(fixtureRoot, 'aks-cluster-metadata');

      const patched = fs as any;
      patched.statSync = (p: fs.PathLike, options?: any) =>
        (originalFs.statSync as any)(redirect(p), options);
      patched.existsSync = (p: fs.PathLike) =>
        originalFs.existsSync(redirect(p));
      patched.readFileSync = (p: any, options?: any) =>
        (originalFs.readFileSync as any)(
          typeof p === 'number' ? p : redirect(p),
          options
        );
    });

    afterEach(() => {
      const patched = fs as any;
      patched.statSync = originalFs.statSync;
      patched.existsSync = originalFs.existsSync;
      patched.readFileSync = originalFs.readFileSync;
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it('should detect AKS when the ConfigMap is mounted as a volume', () => {
      // Kubernetes projects each ConfigMap key into its own file.
      fs.mkdirSync(metadataPath);
      fs.writeFileSync(
        path.join(metadataPath, 'clusterResourceId'),
        `${TEST_RESOURCE_ID}\n`
      );

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], 'azure');
      assert.strictEqual(attributes[ATTR_CLOUD_PLATFORM], 'azure.aks');
      assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'test-aks-cluster');
      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        TEST_RESOURCE_ID
      );
    });

    it('should detect AKS when the ConfigMap key is mounted with subPath', () => {
      // A subPath mount produces a file holding only the raw value.
      fs.writeFileSync(metadataPath, `${TEST_RESOURCE_ID}\n`);

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'test-aks-cluster');
      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        TEST_RESOURCE_ID
      );
    });

    it('should detect AKS from a key=value metadata file', () => {
      fs.writeFileSync(
        metadataPath,
        `# aks metadata\nclusterResourceId=${TEST_RESOURCE_ID}\n`
      );

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'test-aks-cluster');
      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        TEST_RESOURCE_ID
      );
    });

    it('should return an empty resource when the mounted directory has no clusterResourceId key', () => {
      fs.mkdirSync(metadataPath);
      fs.writeFileSync(path.join(metadataPath, 'somethingElse'), 'value\n');

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], undefined);
      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        undefined
      );
    });

    it('should prefer an explicit clusterResourceId entry over unrelated bare lines', () => {
      fs.writeFileSync(
        metadataPath,
        `clusterResourceId=${TEST_RESOURCE_ID}\nstray-token\n// not a comment format we strip\n`
      );

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        TEST_RESOURCE_ID
      );
      assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'test-aks-cluster');
    });

    it('should ignore an ambiguous file with multiple bare lines', () => {
      fs.writeFileSync(metadataPath, `${TEST_RESOURCE_ID}\nstray-token\n`);

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_CLOUD_PROVIDER], undefined);
      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        undefined
      );
    });

    it('should tolerate CRLF line endings and a byte order mark', () => {
      fs.writeFileSync(
        metadataPath,
        `\ufeffclusterResourceId=${TEST_RESOURCE_ID}\r\n`
      );

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(
        attributes[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE],
        TEST_RESOURCE_ID
      );
    });

    it('should prefer the CLUSTER_RESOURCE_ID environment variable over the mounted file', () => {
      process.env.CLUSTER_RESOURCE_ID =
        '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/from-env';
      fs.mkdirSync(metadataPath);
      fs.writeFileSync(
        path.join(metadataPath, 'clusterResourceId'),
        `${TEST_RESOURCE_ID}\n`
      );

      const attributes = detectResources({
        detectors: [azureAksDetector],
      }).attributes;

      assert.strictEqual(attributes[ATTR_K8S_CLUSTER_NAME], 'from-env');
    });
  });
});
