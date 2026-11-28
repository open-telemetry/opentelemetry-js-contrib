/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Implementation in this file copied from
 * https://github.com/GoogleCloudPlatform/opentelemetry-operations-go/blob/v1.8.0/detectors/gcp/faas.go
 */

import { diag } from '@opentelemetry/api';
import * as metadata from 'gcp-metadata';

const ID_METADATA_ATTR = 'id';
const CLOUD_RUN_CONFIG_ENV = 'K_CONFIGURATION';
const CLOUD_FUNCTION_TARGET_ENV = 'FUNCTION_TARGET';
const CLOUD_RUN_JOB_ENV = 'CLOUD_RUN_JOB';
const CLOUD_RUN_EXECUTION_ENV = 'CLOUD_RUN_EXECUTION';
const CLOUD_RUN_TASK_INDEX_ENV = 'CLOUD_RUN_TASK_INDEX';
const FAAS_SERVICE_ENV = 'K_SERVICE';
const FAAS_REVISION_ENV = 'K_REVISION';
const REGION_METADATA_ATTR = 'region';

export async function onCloudRun(): Promise<boolean> {
  return process.env[CLOUD_RUN_CONFIG_ENV] !== undefined;
}

export async function onCloudFunctions(): Promise<boolean> {
  return process.env[CLOUD_FUNCTION_TARGET_ENV] !== undefined;
}

export async function onCloudRunJob(): Promise<boolean> {
  return process.env[CLOUD_RUN_JOB_ENV] !== undefined;
}

/**
 * The name of the Cloud Run or Cloud Function. Check that {@link onCloudRun()} or {@link
 * onCloudFunctions()} is true before calling this, or it may throw exceptions.
 */
export async function faasName(): Promise<string> {
  return lookupEnv(FAAS_SERVICE_ENV);
}

/**
 * The version/revision of the Cloud Run or Cloud Function. Check that {@link onCloudRun()} or
 * {@link onCloudFunctions()} is true before calling this, or it may throw exceptions.
 */
export async function faasVersion(): Promise<string> {
  return lookupEnv(FAAS_REVISION_ENV);
}

/**
 * The name of the Cloud Run job. Check that {@link onCloudRunJob()} is true before calling this,
 * or it may throw exceptions.
 */
export async function cloudRunJobName(): Promise<string> {
  return lookupEnv(CLOUD_RUN_JOB_ENV);
}

/**
 * The execution name of the Cloud Run job, or undefined if unset or empty.
 */
export async function cloudRunJobExecution(): Promise<string | undefined> {
  return process.env[CLOUD_RUN_EXECUTION_ENV] || undefined;
}

/**
 * The task index of the Cloud Run job, or undefined if unset, empty, or not an integer.
 */
export async function cloudRunJobTaskIndex(): Promise<number | undefined> {
  const val = process.env[CLOUD_RUN_TASK_INDEX_ENV];
  if (!val) {
    return undefined;
  }
  const trimmed = val.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    diag.warn(
      'Environment variable %s is not a valid integer: %s',
      CLOUD_RUN_TASK_INDEX_ENV,
      val
    );
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) {
    diag.warn(
      'Environment variable %s is out of safe integer range: %s',
      CLOUD_RUN_TASK_INDEX_ENV,
      val
    );
    return undefined;
  }
  return parsed;
}

/**
 * The ID for the running instance of a Cloud Run or Cloud Function. Check that {@link
 * onCloudRun()} or {@link onCloudFunctions()} is true before calling this, or it may throw
 * exceptions.
 */
export async function faasInstance(): Promise<string> {
  // May be a bignumber.js BigNumber which can just be converted with toString(). See
  // https://github.com/googleapis/gcp-metadata#take-care-with-large-number-valued-properties
  const id = await metadata.instance<number | object>(ID_METADATA_ATTR);
  return id.toString();
}

/**
 * The cloud region where the running instance of a Cloud Run or Cloud Function is located.
 * Check that {@link onCloudRun()} or {@link onCloudFunctions()} is true before calling this,
 * or it may throw exceptions.
 */
export async function faasCloudRegion(): Promise<string> {
  const region = await metadata.instance<string>(REGION_METADATA_ATTR);
  return region.slice(region.lastIndexOf('/') + 1);
}

function lookupEnv(key: string): string {
  const val = process.env[key];
  if (val === undefined) {
    throw new Error(`Environment variable ${key} not found`);
  }
  return val;
}
