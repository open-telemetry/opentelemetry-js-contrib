/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

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
  AKS_CLUSTER_RESOURCE_ID_KEY,
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
      const content = this.readAksMetadataContent();
      if (content === undefined) {
        return undefined;
      }

      const metadata = this.parseAksMetadata(content);
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

  /**
   * Reads the raw AKS metadata content, supporting the layouts the
   * aks-cluster-metadata ConfigMap can take inside a pod:
   *
   * - mounted as a volume, where Kubernetes creates a directory containing one
   *   file per key, so the value lives in `<path>/clusterResourceId`
   * - mounted with `subPath`, or written by tooling, where the path is a file
   *   holding either the raw resource ID or `clusterResourceId=<resource ID>`
   */
  private readAksMetadataContent(): string | undefined {
    const stats = fs.statSync(AKS_METADATA_FILE_PATH, {
      throwIfNoEntry: false,
    });

    if (!stats) {
      return undefined;
    }

    if (stats.isDirectory()) {
      const keyPath = path.join(
        AKS_METADATA_FILE_PATH,
        AKS_CLUSTER_RESOURCE_ID_KEY
      );
      if (!fs.existsSync(keyPath)) {
        return undefined;
      }
      return fs.readFileSync(keyPath, 'utf8');
    }

    return fs.readFileSync(AKS_METADATA_FILE_PATH, 'utf8');
  }

  private parseAksMetadata(content: string): AksClusterMetadata {
    const metadata: AksClusterMetadata = {};
    let keyedResourceId: string | undefined;
    const bareValues: string[] = [];

    // The native aks-cluster-metadata ConfigMap has a single key: clusterResourceId.
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        bareValues.push(trimmedLine);
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (key === AKS_CLUSTER_RESOURCE_ID_KEY && value) {
        keyedResourceId = value;
      }
    }

    // An explicit `clusterResourceId=<value>` entry always wins. Otherwise fall back to a
    // bare value, which is what Kubernetes writes when the key is projected into a file of
    // its own. Only a single unambiguous line is accepted so that unrelated content in a
    // multi line file is never mistaken for the resource ID.
    const resourceId =
      keyedResourceId ?? (bareValues.length === 1 ? bareValues[0] : undefined);

    if (resourceId) {
      metadata.resourceId = resourceId;
      metadata.name = extractClusterNameFromResourceId(resourceId);
    }

    return metadata;
  }
}

export const azureAksDetector = new AzureAksDetector();
