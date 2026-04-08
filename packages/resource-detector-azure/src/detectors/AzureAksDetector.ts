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

import * as fs from 'fs';

import { diag } from '@opentelemetry/api';
import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_K8S_CLUSTER_NAME,
  CLOUD_PLATFORM_VALUE_AZURE_AKS,
  CLOUD_PROVIDER_VALUE_AZURE,
} from '../semconv';
import {
  AKS_CLUSTER_RESOURCE_ID,
  AKS_METADATA_FILE_PATH,
  AksClusterMetadata,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
  extractClusterNameFromResourceId,
} from '../types';

/**
 * The AzureAksDetector can be used to detect if a process is running in an Azure Kubernetes Service (AKS) cluster.
 * It reads cluster metadata from environment variables populated from the aks-cluster-metadata ConfigMap
 * in the kube-public namespace, or from the ConfigMap file if mounted.
 *
 * The ConfigMap contains a single key 'clusterResourceId' with the full ARM resource ID.
 * The cluster name is extracted from this resource ID.
 *
 * @returns a {@link Resource} populated with data about the AKS environment or an empty Resource if detection fails.
 */
class AzureAksDetector implements ResourceDetector {
  public detect(): DetectedResource {
    let attributes = {};

    const metadata = this.getAksMetadata();
    if (metadata && (metadata.name || metadata.resourceId)) {
      attributes = {
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AZURE,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AZURE_AKS,
      };

      if (metadata.name) {
        attributes = {
          ...attributes,
          [ATTR_K8S_CLUSTER_NAME]: metadata.name,
        };
      }

      if (metadata.resourceId) {
        attributes = {
          ...attributes,
          [CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: metadata.resourceId,
        };
      }

      diag.debug('AzureAksDetector: detected AKS cluster:', metadata);
    }

    return { attributes };
  }

  private getAksMetadata(): AksClusterMetadata | undefined {
    // Try environment variable first (populated from aks-cluster-metadata ConfigMap)
    const clusterResourceId = process.env[AKS_CLUSTER_RESOURCE_ID];

    if (clusterResourceId) {
      return {
        name: extractClusterNameFromResourceId(clusterResourceId),
        resourceId: clusterResourceId,
      };
    }

    // Fall back to reading from mounted ConfigMap file
    return this.getAksMetadataFromFile();
  }

  private getAksMetadataFromFile(): AksClusterMetadata | undefined {
    try {
      if (!fs.existsSync(AKS_METADATA_FILE_PATH)) {
        return undefined;
      }

      const content = fs.readFileSync(AKS_METADATA_FILE_PATH, 'utf8');
      const metadata: AksClusterMetadata = {};

      // Parse the ConfigMap file content (key=value format)
      // The native aks-cluster-metadata ConfigMap has a single key: clusterResourceId
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }

        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=').trim();

        if (key === 'clusterResourceId' && value) {
          metadata.resourceId = value;
          metadata.name = extractClusterNameFromResourceId(value);
        }
      }

      if (metadata.resourceId) {
        return metadata;
      }
    } catch (err: any) {
      diag.debug(
        'AzureAksDetector: failed to read AKS metadata file:',
        err.message
      );
    }

    return undefined;
  }
}

export const azureAksDetector = new AzureAksDetector();
