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
import { context, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  DetectorSync,
  ResourceDetectionConfig,
  Resource,
  ResourceAttributes,
  IResource,
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
class GcpDetector implements DetectorSync {
  detect(_config?: ResourceDetectionConfig): IResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return new Resource({}, attributes);
  }

  /**
   * Attempts to connect and obtain instance configuration data from the GCP metadata service.
   * If the connection is successful it returns a promise containing a {@link ResourceAttributes}
   * object with instance metadata. Returns a promise containing an
   * empty {@link ResourceAttributes} if the connection or parsing of the metadata fails.
   */
  private async _getAttributes(): Promise<ResourceAttributes> {
    if (!(await gcpMetadata.isAvailable())) {
      diag.debug('GcpDetector failed: GCP Metadata unavailable.');
      return {};
    }

    const [projectId, instanceId, zoneId, clusterName, hostname] =
      await Promise.all([
        this._getProjectId(),
        this._getInstanceId(),
        this._getZone(),
        this._getClusterName(),
        this._getHostname(),
      ]);

    const attributes: ResourceAttributes = {};
    attributes[SEMRESATTRS_CLOUD_ACCOUNT_ID] = projectId;
    attributes[SEMRESATTRS_HOST_ID] = instanceId;
    attributes[SEMRESATTRS_HOST_NAME] = hostname;
    attributes[SEMRESATTRS_CLOUD_AVAILABILITY_ZONE] = zoneId;
    attributes[SEMRESATTRS_CLOUD_PROVIDER] = CLOUDPROVIDERVALUES_GCP;

    if (process.env.KUBERNETES_SERVICE_HOST)
      this._addK8sAttributes(attributes, clusterName);

    return attributes;
  }

  /** Add resource attributes for K8s */
  private _addK8sAttributes(
    attributes: ResourceAttributes,
    clusterName: string
  ): void {
    attributes[SEMRESATTRS_K8S_CLUSTER_NAME] = clusterName;
    attributes[SEMRESATTRS_K8S_NAMESPACE_NAME] = process.env.NAMESPACE ?? '';
    attributes[SEMRESATTRS_K8S_POD_NAME] = process.env.HOSTNAME ?? '';
    attributes[SEMRESATTRS_CONTAINER_NAME] = process.env.CONTAINER_NAME ?? '';
  }

  /** Gets project id from GCP project metadata. */
  private async _getProjectId(): Promise<string> {
    try {
      return await gcpMetadata.project('project-id');
    } catch {
      return '';
    }
  }

  /** Gets instance id from GCP instance metadata. */
  private async _getInstanceId(): Promise<string> {
    try {
      const id = await gcpMetadata.instance('id');
      return id.toString();
    } catch {
      return '';
    }
  }

  /** Gets zone from GCP instance metadata. */
  private async _getZone(): Promise<string> {
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
  private async _getClusterName(): Promise<string> {
    try {
      return await gcpMetadata.instance('attributes/cluster-name');
    } catch {
      return '';
    }
  }

  /** Gets hostname from GCP instance metadata. */
  private async _getHostname(): Promise<string> {
    try {
      return await gcpMetadata.instance('hostname');
    } catch {
      return '';
    }
  }
}

export const gcpDetector = new GcpDetector();
