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
 * https://github.com/GoogleCloudPlatform/opentelemetry-operations-go/blob/v1.8.0/detectors/gcp/gce.go
 */

import { diag } from '@opentelemetry/api';
import * as metadata from 'gcp-metadata';

const MACHINE_TYPE_METADATA_ATTR = 'machine-type';
const ID_METADATA_ATTR = 'id';
const HOST_NAME_METADATA_ATTR = 'name';
const ZONE_METADATA_ATTR = 'zone';

export async function onGce(): Promise<boolean> {
  try {
    await metadata.instance<string>(MACHINE_TYPE_METADATA_ATTR);
    return true;
  } catch (err) {
    diag.debug(
      'Could not fetch metadata attribute %s, assuming not on GCE. Error was %s',
      MACHINE_TYPE_METADATA_ATTR,
      err
    );
    return false;
  }
}

/**
 * The machine type of the instance on which this program is running. Check that {@link
 * onGce()} is true before calling this, or it may throw exceptions.
 */
export async function hostType(): Promise<string> {
  return metadata.instance<string>(MACHINE_TYPE_METADATA_ATTR);
}

/**
 * The instance ID of the instance on which this program is running. Check that {@link onGce()}
 * is true before calling this, or it may throw exceptions.
 */
export async function hostId(): Promise<string> {
  // May be a bignumber.js BigNumber which can just be converted with toString(). See
  // https://github.com/googleapis/gcp-metadata#take-care-with-large-number-valued-properties
  const id = await metadata.instance<number | object>(ID_METADATA_ATTR);
  return id.toString();
}

/**
 * The instance ID of the instance on which this program is running. Check that {@link onGce()}
 * is true before calling this, or it may throw exceptions.
 */
export async function hostName(): Promise<string> {
  return metadata.instance<string>(HOST_NAME_METADATA_ATTR);
}

/**
 * The zone and region in which this program is running. Check that {@link onGce()} is true
 * before calling this, or it may throw exceptions.
 */
export async function availabilityZoneAndRegion(): Promise<{
  zone: string;
  region: string;
}> {
  const fullZone = await metadata.instance<string>(ZONE_METADATA_ATTR);

  // Format described in
  // https://cloud.google.com/compute/docs/metadata/default-metadata-values#vm_instance_metadata
  const re = /projects\/\d+\/zones\/(?<zone>(?<region>\w+-\w+)-\w+)/;
  const { zone, region } = fullZone.match(re)?.groups ?? {};
  if (!zone || !region) {
    throw new Error(
      `zone was not in the expected format: projects/PROJECT_NUM/zones/COUNTRY-REGION-ZONE. Got ${fullZone}`
    );
  }

  return { zone, region };
}
