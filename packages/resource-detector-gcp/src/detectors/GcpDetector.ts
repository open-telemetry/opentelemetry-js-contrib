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

import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  CLOUD_PLATFORM_VALUE_GCP_APP_ENGINE,
  CLOUD_PLATFORM_VALUE_GCP_CLOUD_FUNCTIONS,
  CLOUD_PLATFORM_VALUE_GCP_CLOUD_RUN,
  CLOUD_PLATFORM_VALUE_GCP_COMPUTE_ENGINE,
  CLOUD_PLATFORM_VALUE_GCP_KUBERNETES_ENGINE,
  CLOUD_PROVIDER_VALUE_GCP,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_FAAS_INSTANCE,
  ATTR_FAAS_NAME,
  ATTR_FAAS_VERSION,
  ATTR_HOST_ID,
  ATTR_HOST_NAME,
  ATTR_HOST_TYPE,
  ATTR_K8S_CLUSTER_NAME,
} from '../semconv';

import { AttributeValue, Attributes } from '@opentelemetry/api';
import {
  DetectedResource,
  DetectedResourceAttributes,
  emptyResource,
  Resource,
  ResourceDetector,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import * as metadata from 'gcp-metadata';
import * as faas from './faas';
import * as gae from './gae';
import * as gce from './gce';
import * as gke from './gke';

const ATTRIBUTE_NAMES = [
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_CLOUD_REGION,
  ATTR_K8S_CLUSTER_NAME,
  ATTR_HOST_TYPE,
  ATTR_HOST_ID,
  ATTR_HOST_NAME,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_FAAS_NAME,
  ATTR_FAAS_VERSION,
  ATTR_FAAS_INSTANCE,
] as const;

// Ensure that all resource keys are accounted for in ATTRIBUTE_NAMES
type GcpResourceAttributeName = (typeof ATTRIBUTE_NAMES)[number];
type GcpResourceAttributes = Partial<
  Record<GcpResourceAttributeName, AttributeValue>
>;

async function detect(): Promise<Resource> {
  if (!(await metadata.isAvailable())) {
    return emptyResource();
  }

  // Note the order of these if checks is significant with more specific resources coming
  // first. E.g. Cloud Functions gen2 are executed in Cloud Run so it must be checked first.
  if (await gke.onGke()) {
    return await gkeResource();
  } else if (await faas.onCloudFunctions()) {
    return await cloudFunctionsResource();
  } else if (await faas.onCloudRun()) {
    return await cloudRunResource();
  } else if (await gae.onAppEngine()) {
    return await gaeResource();
  } else if (await gce.onGce()) {
    return await gceResource();
  }

  return emptyResource();
}

async function gkeResource(): Promise<Resource> {
  const [zoneOrRegion, k8sClusterName, hostId] = await Promise.all([
    gke.availabilityZoneOrRegion(),
    gke.clusterName(),
    gke.hostId(),
  ]);

  return await makeResource({
    [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_GCP_KUBERNETES_ENGINE,
    [zoneOrRegion.type === 'zone'
      ? ATTR_CLOUD_AVAILABILITY_ZONE
      : ATTR_CLOUD_REGION]: zoneOrRegion.value,
    [ATTR_K8S_CLUSTER_NAME]: k8sClusterName,
    [ATTR_HOST_ID]: hostId,
  });
}

async function cloudRunResource(): Promise<Resource> {
  const [faasName, faasVersion, faasInstance, faasCloudRegion] =
    await Promise.all([
      faas.faasName(),
      faas.faasVersion(),
      faas.faasInstance(),
      faas.faasCloudRegion(),
    ]);

  return await makeResource({
    [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_GCP_CLOUD_RUN,
    [ATTR_FAAS_NAME]: faasName,
    [ATTR_FAAS_VERSION]: faasVersion,
    [ATTR_FAAS_INSTANCE]: faasInstance,
    [ATTR_CLOUD_REGION]: faasCloudRegion,
  });
}

async function cloudFunctionsResource(): Promise<Resource> {
  const [faasName, faasVersion, faasInstance, faasCloudRegion] =
    await Promise.all([
      faas.faasName(),
      faas.faasVersion(),
      faas.faasInstance(),
      faas.faasCloudRegion(),
    ]);

  return await makeResource({
    [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_GCP_CLOUD_FUNCTIONS,
    [ATTR_FAAS_NAME]: faasName,
    [ATTR_FAAS_VERSION]: faasVersion,
    [ATTR_FAAS_INSTANCE]: faasInstance,
    [ATTR_CLOUD_REGION]: faasCloudRegion,
  });
}

async function gaeResource(): Promise<Resource> {
  let zone, region;
  if (await gae.onAppEngineStandard()) {
    [zone, region] = await Promise.all([
      gae.standardAvailabilityZone(),
      gae.standardCloudRegion(),
    ]);
  } else {
    ({ zone, region } = await gce.availabilityZoneAndRegion());
  }
  const [faasName, faasVersion, faasInstance] = await Promise.all([
    gae.serviceName(),
    gae.serviceVersion(),
    gae.serviceInstance(),
  ]);

  return await makeResource({
    [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_GCP_APP_ENGINE,
    [ATTR_FAAS_NAME]: faasName,
    [ATTR_FAAS_VERSION]: faasVersion,
    [ATTR_FAAS_INSTANCE]: faasInstance,
    [ATTR_CLOUD_AVAILABILITY_ZONE]: zone,
    [ATTR_CLOUD_REGION]: region,
  });
}

async function gceResource(): Promise<Resource> {
  const [zoneAndRegion, hostType, hostId, hostName] = await Promise.all([
    gce.availabilityZoneAndRegion(),
    gce.hostType(),
    gce.hostId(),
    gce.hostName(),
  ]);

  return await makeResource({
    [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_GCP_COMPUTE_ENGINE,
    [ATTR_CLOUD_AVAILABILITY_ZONE]: zoneAndRegion.zone,
    [ATTR_CLOUD_REGION]: zoneAndRegion.region,
    [ATTR_HOST_TYPE]: hostType,
    [ATTR_HOST_ID]: hostId,
    [ATTR_HOST_NAME]: hostName,
  });
}

async function makeResource(attrs: GcpResourceAttributes): Promise<Resource> {
  const project = await metadata.project<string>('project-id');

  return resourceFromAttributes({
    [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_GCP,
    [ATTR_CLOUD_ACCOUNT_ID]: project,
    ...attrs,
  } satisfies GcpResourceAttributes);
}

/**
 * Google Cloud resource detector which populates attributes based on the environment this
 * process is running in. If not on GCP, returns an empty resource.
 */
export class GcpDetector implements ResourceDetector {
  private async _asyncAttributes(): Promise<Attributes> {
    const resource = await context.with(
      suppressTracing(context.active()),
      detect
    );
    return resource.attributes;
  }

  detect(): DetectedResource {
    const asyncAttributes = this._asyncAttributes();
    const attributes = {} as DetectedResourceAttributes;
    ATTRIBUTE_NAMES.forEach(name => {
      // Each resource attribute is determined asynchronously in _gatherData().
      attributes[name] = asyncAttributes.then(data => data[name]);
    });

    return { attributes };
  }
}

export const gcpDetector = new GcpDetector();
