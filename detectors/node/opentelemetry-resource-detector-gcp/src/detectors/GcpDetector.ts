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

import * as gcpMetadata from 'gcp-metadata';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ResourceDetectionConfig,
  ResourceDetector,
  DetectedResource,
  DetectedResourceAttributes,
} from '@opentelemetry/resources';
import {
  CLOUDPROVIDERVALUES_GCP,
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_CLOUD_AVAILABILITY_ZONE,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CONTAINER_NAME,
  SEMRESATTRS_HOST_ID,
  SEMRESATTRS_HOST_NAME,
  SEMRESATTRS_K8S_CLUSTER_NAME,
  SEMRESATTRS_K8S_NAMESPACE_NAME,
  SEMRESATTRS_K8S_POD_NAME,
} from '@opentelemetry/semantic-conventions';

/**
 * The GcpDetector can be used to detect if a process is running in the Google
 * Cloud Platform and return a {@link Resource} populated with metadata about
 * the instance. Returns an empty Resource if detection fails.
 */
class GcpDetector implements ResourceDetector {
  detect(_config?: ResourceDetectionConfig): DetectedResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return { attributes };
  }

  /**
   * Asynchronously gather GCP cloud metadata.
   */
  private _getAttributes(): DetectedResourceAttributes {
    const isAvail = gcpMetadata.isAvailable();

    const attributes: DetectedResourceAttributes = {
      [SEMRESATTRS_CLOUD_PROVIDER]: (async () => {
        return (await isAvail) ? CLOUDPROVIDERVALUES_GCP : undefined;
      })(),
      [SEMRESATTRS_CLOUD_ACCOUNT_ID]: this._getProjectId(isAvail),
      [SEMRESATTRS_HOST_ID]: this._getInstanceId(isAvail),
      [SEMRESATTRS_HOST_NAME]: this._getHostname(isAvail),
      [SEMRESATTRS_CLOUD_AVAILABILITY_ZONE]: this._getZone(isAvail),
    };

    // Add resource attributes for K8s.
    if (process.env.KUBERNETES_SERVICE_HOST) {
      attributes[SEMRESATTRS_K8S_CLUSTER_NAME] = this._getClusterName(isAvail);
      attributes[SEMRESATTRS_K8S_NAMESPACE_NAME] = (async () => {
        return (await isAvail) ? process.env.NAMESPACE : undefined;
      })();
      attributes[SEMRESATTRS_K8S_POD_NAME] = (async () => {
        return (await isAvail) ? process.env.HOSTNAME : undefined;
      })();
      attributes[SEMRESATTRS_CONTAINER_NAME] = (async () => {
        return (await isAvail) ? process.env.CONTAINER_NAME : undefined;
      })();
    }

    return attributes;
  }

  /** Gets project id from GCP project metadata. */
  private async _getProjectId(
    isAvail: Promise<boolean>
  ): Promise<string | undefined> {
    if (!(await isAvail)) {
      return undefined;
    }
    try {
      return await gcpMetadata.project('project-id');
    } catch {
      return '';
    }
  }

  /** Gets instance id from GCP instance metadata. */
  private async _getInstanceId(
    isAvail: Promise<boolean>
  ): Promise<string | undefined> {
    if (!(await isAvail)) {
      return undefined;
    }
    try {
      const id = await gcpMetadata.instance('id');
      return id.toString();
    } catch {
      return '';
    }
  }

  /** Gets zone from GCP instance metadata. */
  private async _getZone(
    isAvail: Promise<boolean>
  ): Promise<string | undefined> {
    if (!(await isAvail)) {
      return undefined;
    }
    try {
      const zoneId = await gcpMetadata.instance('zone');
      if (zoneId) {
        return zoneId.split('/').pop();
      }
      return '';
    } catch {
      return '';
    }
  }

  /** Gets cluster name from GCP instance metadata. */
  private async _getClusterName(
    isAvail: Promise<boolean>
  ): Promise<string | undefined> {
    if (!(await isAvail)) {
      return undefined;
    }
    try {
      return await gcpMetadata.instance('attributes/cluster-name');
    } catch {
      return '';
    }
  }

  /** Gets hostname from GCP instance metadata. */
  private async _getHostname(
    isAvail: Promise<boolean>
  ): Promise<string | undefined> {
    if (!(await isAvail)) {
      return undefined;
    }
    try {
      return await gcpMetadata.instance('hostname');
    } catch {
      return '';
    }
  }
}

export const gcpDetector = new GcpDetector();
