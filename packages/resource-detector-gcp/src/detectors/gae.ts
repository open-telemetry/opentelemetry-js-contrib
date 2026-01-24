/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2023 Google LLC
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
 * https://github.com/GoogleCloudPlatform/opentelemetry-operations-go/blob/v1.8.0/detectors/gcp/app_engine.go
 */

import * as metadata from 'gcp-metadata';
import * as gce from './gce';
import * as faas from './faas';

const GAE_SERVICE_ENV = 'GAE_SERVICE';
const GAE_VERSION_ENV = 'GAE_VERSION';
const GAE_INSTANCE_ENV = 'GAE_INSTANCE';
const GAE_ENV = 'GAE_ENV';
const GAE_STANDARD = 'standard';
const ZONE_METADATA_ATTR = 'zone';

export async function onAppEngineStandard(): Promise<boolean> {
  return process.env[GAE_ENV] === GAE_STANDARD;
}

export async function onAppEngine(): Promise<boolean> {
  return process.env[GAE_SERVICE_ENV] !== undefined;
}

/**
 * The service name of the app engine service. Check that {@link onAppEngine()} is true before
 * calling this, or it may throw exceptions.
 */
export async function serviceName(): Promise<string> {
  return lookupEnv(GAE_SERVICE_ENV);
}

/**
 * The service version of the app engine service. Check that {@link onAppEngine()} is true
 * before calling this, or it may throw exceptions.
 */
export async function serviceVersion(): Promise<string> {
  return lookupEnv(GAE_VERSION_ENV);
}

/**
 * The service instance of the app engine service. Check that {@link onAppEngine()} is true
 * before calling this, or it may throw exceptions.
 */
export async function serviceInstance(): Promise<string> {
  return lookupEnv(GAE_INSTANCE_ENV);
}

/**
 * The zone and region in which this program is running. Check that {@link onAppEngine()} is
 * true before calling this, or it may throw exceptions.
 */
export async function flexAvailabilityZoneAndRegion(): Promise<{
  zone: string;
  region: string;
}> {
  return await gce.availabilityZoneAndRegion();
}

/**
 * The zone the app engine service is running in. Check that {@link onAppEngineStandard()} is
 * true before calling this, or it may throw exceptions.
 */
export async function standardAvailabilityZone(): Promise<string> {
  const zone = await metadata.instance<string>(ZONE_METADATA_ATTR);
  // zone is of the form "projects/233510669999/zones/us15"
  return zone.slice(zone.lastIndexOf('/') + 1);
}

/**
 * The region the app engine service is running in. Check that {@link onAppEngineStandard()} is
 * true before calling this, or it may throw exceptions.
 */
export async function standardCloudRegion(): Promise<string> {
  return await faas.faasCloudRegion();
}

function lookupEnv(key: string): string {
  const val = process.env[key];
  if (val === undefined) {
    throw new Error(`Environment variable ${key} not found`);
  }
  return val;
}
