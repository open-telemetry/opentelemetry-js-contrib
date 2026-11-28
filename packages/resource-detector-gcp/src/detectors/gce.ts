/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
const INSTANCE_HOSTNAME_METADATA_ATTR = 'hostname';
const ZONE_METADATA_ATTR = 'zone';
const CREATED_BY_METADATA_ATTR = 'attributes/created-by';

// Format described in:
// https://cloud.google.com/compute/docs/instance-groups/getting-info-about-migs#checking_if_a_vm_instance_is_part_of_a_mig
const CREATED_BY_MIG_RE =
  /^projects\/[^/]+\/(?<type>zones|regions)\/(?<location>[^/]+)\/instanceGroupManagers\/(?<name>[^/]+)$/;

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
 * The full hostname of the GCE instance on which this program is running, or
 * undefined if the metadata attribute is unavailable.
 */
export async function instanceHostname(): Promise<string | undefined> {
  try {
    const hostname = await metadata.instance<string>(
      INSTANCE_HOSTNAME_METADATA_ATTR
    );
    return hostname || undefined;
  } catch (err) {
    diag.debug(
      'Could not fetch metadata attribute %s. Error was %s',
      INSTANCE_HOSTNAME_METADATA_ATTR,
      err
    );
    return undefined;
  }
}

export interface ManagedInstanceGroup {
  name: string;
  location: string;
  type: 'zone' | 'region';
}

/**
 * The Managed Instance Group (MIG) that created this GCE instance, if any.
 * Returns undefined if the instance is not part of a MIG or the metadata
 * attribute is unavailable or unrecognized.
 */
export async function managedInstanceGroup(): Promise<
  ManagedInstanceGroup | undefined
> {
  let createdBy: string | undefined;
  try {
    createdBy = await metadata.instance<string>(CREATED_BY_METADATA_ATTR);
  } catch (err) {
    diag.debug(
      'Could not fetch metadata attribute %s, assuming not in a MIG. Error was %s',
      CREATED_BY_METADATA_ATTR,
      err
    );
    return undefined;
  }
  if (typeof createdBy !== 'string') {
    return undefined;
  }
  const match = CREATED_BY_MIG_RE.exec(createdBy.trim());
  if (!match?.groups) {
    return undefined;
  }
  const { type, location, name } = match.groups;
  return {
    name,
    location,
    type: type === 'zones' ? 'zone' : 'region',
  };
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
