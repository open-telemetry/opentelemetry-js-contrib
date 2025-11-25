/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2022 Google LLC
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

/**
 * Implementation in this file copied from
 * https://github.com/GoogleCloudPlatform/opentelemetry-operations-go/blob/v1.8.0/detectors/gcp/gke.go
 */

import * as metadata from 'gcp-metadata';
import * as gce from './gce';

const KUBERNETES_SERVICE_HOST_ENV = 'KUBERNETES_SERVICE_HOST';
const CLUSTER_NAME_METADATA_ATTR = 'attributes/cluster-name';
const CLUSTER_LOCATION_METADATA_ATTR = 'attributes/cluster-location';

export async function onGke(): Promise<boolean> {
  return process.env[KUBERNETES_SERVICE_HOST_ENV] !== undefined;
}

/**
 * The instance ID of the instance on which this program is running. Check that {@link onGke()}
 * is true before calling this, or it may throw exceptions.
 */
export async function hostId(): Promise<string> {
  return await gce.hostId();
}

/**
 * The name of the GKE cluster in which this program is running. Check that {@link onGke()} is
 * true before calling this, or it may throw exceptions.
 */
export async function clusterName(): Promise<string> {
  return metadata.instance<string>(CLUSTER_NAME_METADATA_ATTR);
}

/**
 * The location of the cluster and whether the cluster is zonal or regional. Check that {@link
 * onGke()} is true before calling this, or it may throw exceptions.
 */
export async function availabilityZoneOrRegion(): Promise<{
  type: 'zone' | 'region';
  value: string;
}> {
  const clusterLocation = await metadata.instance<string>(
    CLUSTER_LOCATION_METADATA_ATTR
  );
  switch (countChar(clusterLocation, '-')) {
    case 1:
      return { type: 'region', value: clusterLocation };
    case 2:
      return { type: 'zone', value: clusterLocation };
    default:
      throw new Error(
        `unrecognized format for cluster location: ${clusterLocation}`
      );
  }
}

function countChar(s: string, char: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === char) {
      count += 1;
    }
  }
  return count;
}
