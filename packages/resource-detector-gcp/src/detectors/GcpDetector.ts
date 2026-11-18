/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
  ATTR_CLOUD_RESOURCE_ID,
  ATTR_FAAS_INSTANCE,
  ATTR_FAAS_NAME,
  ATTR_FAAS_VERSION,
  ATTR_GCP_CLOUD_RUN_JOB_EXECUTION,
  ATTR_GCP_CLOUD_RUN_JOB_TASK_INDEX,
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
  ATTR_CLOUD_RESOURCE_ID,
  ATTR_K8S_CLUSTER_NAME,
  ATTR_HOST_TYPE,
  ATTR_HOST_ID,
  ATTR_HOST_NAME,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_FAAS_NAME,
  ATTR_FAAS_VERSION,
  ATTR_FAAS_INSTANCE,
  ATTR_GCP_CLOUD_RUN_JOB_EXECUTION,
  ATTR_GCP_CLOUD_RUN_JOB_TASK_INDEX,
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
  } else if (await faas.onCloudRunJob()) {
    return await cloudRunJobResource();
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
  const [faasName, faasVersion] = await Promise.all([
    faas.faasName(),
    faas.faasVersion(),
  ]);

  return await faasResource(
    CLOUD_PLATFORM_VALUE_GCP_CLOUD_RUN,
    faasName,
    'run.googleapis.com',
    'services',
    { [ATTR_FAAS_VERSION]: faasVersion }
  );
}

async function cloudRunJobResource(): Promise<Resource> {
  const [faasName, jobExecution, jobTaskIndex] = await Promise.all([
    faas.cloudRunJobName(),
    faas.cloudRunJobExecution(),
    faas.cloudRunJobTaskIndex(),
  ]);

  const extraAttrs: GcpResourceAttributes = {};
  if (jobExecution !== undefined) {
    extraAttrs[ATTR_GCP_CLOUD_RUN_JOB_EXECUTION] = jobExecution;
  }
  if (jobTaskIndex !== undefined) {
    extraAttrs[ATTR_GCP_CLOUD_RUN_JOB_TASK_INDEX] = jobTaskIndex;
  }

  return await faasResource(
    CLOUD_PLATFORM_VALUE_GCP_CLOUD_RUN,
    faasName,
    'run.googleapis.com',
    'jobs',
    extraAttrs
  );
}

async function cloudFunctionsResource(): Promise<Resource> {
  const [faasName, faasVersion] = await Promise.all([
    faas.faasName(),
    faas.faasVersion(),
  ]);

  return await faasResource(
    CLOUD_PLATFORM_VALUE_GCP_CLOUD_FUNCTIONS,
    faasName,
    'cloudfunctions.googleapis.com',
    'functions',
    { [ATTR_FAAS_VERSION]: faasVersion }
  );
}

async function faasResource(
  cloudPlatform: string,
  faasName: string,
  serviceHost: string,
  resourceCollection: string,
  extraAttrs: GcpResourceAttributes
): Promise<Resource> {
  const [faasInstance, faasCloudRegion, projectId] = await Promise.all([
    faas.faasInstance(),
    faas.faasCloudRegion(),
    metadata.project<string>('project-id'),
  ]);

  const attrs: GcpResourceAttributes = {
    [ATTR_CLOUD_PLATFORM]: cloudPlatform,
    [ATTR_FAAS_NAME]: faasName,
    [ATTR_FAAS_INSTANCE]: faasInstance,
    [ATTR_CLOUD_REGION]: faasCloudRegion,
    ...extraAttrs,
  };

  if (projectId && faasCloudRegion && faasName) {
    attrs[ATTR_CLOUD_RESOURCE_ID] =
      `//${serviceHost}/projects/${projectId}/locations/${faasCloudRegion}/${resourceCollection}/${faasName}`;
  }

  return await makeResource(attrs, projectId);
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

async function makeResource(
  attrs: GcpResourceAttributes,
  projectId?: string
): Promise<Resource> {
  const project = projectId ?? (await metadata.project<string>('project-id'));

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

  public detect(): DetectedResource {
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
