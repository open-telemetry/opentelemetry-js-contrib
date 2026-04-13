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

import * as os from 'os';
import { randomUUID } from 'crypto';

import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_HOST_NAME,
} from '@opentelemetry/semantic-conventions';

import type { NodeProfilingOptions } from './types';

const DEFAULT_SERVICE_NAME = 'unknown_service:node';
const PROFILER_VERSION = '0.1.0';
const RUNTIME_ID = randomUUID().replace(/-/g, '');

export function buildProfilerTags(
  options: Pick<
    NodeProfilingOptions,
    | 'resource'
    | 'tags'
    | 'serviceName'
    | 'serviceVersion'
    | 'deploymentEnvironment'
    | 'hostName'
  >
): Record<string, string> {
  const resourceAttributes = options.resource?.attributes ?? {};
  const tags: Record<string, string> = {
    language: 'nodejs',
    runtime: 'Node.js',
    runtime_version: process.version,
    process_id: String(process.pid),
    'runtime-id': RUNTIME_ID,
    profiler_version: PROFILER_VERSION,
    host:
      firstNonEmpty(
        options.hostName,
        attributeString(resourceAttributes[SEMRESATTRS_HOST_NAME]),
        os.hostname()
      ) ?? os.hostname(),
    service:
      firstNonEmpty(
        options.serviceName,
        attributeString(resourceAttributes[ATTR_SERVICE_NAME]),
        process.env.OTEL_SERVICE_NAME,
        DEFAULT_SERVICE_NAME
      ) ?? DEFAULT_SERVICE_NAME,
  };

  const version = firstNonEmpty(
    options.serviceVersion,
    attributeString(resourceAttributes[ATTR_SERVICE_VERSION])
  );
  if (version !== undefined) {
    tags.version = version;
  }

  const env = firstNonEmpty(
    options.deploymentEnvironment,
    attributeString(resourceAttributes[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT])
  );
  if (env !== undefined) {
    tags.env = env;
  }

  for (const [key, value] of Object.entries(options.tags ?? {})) {
    tags[key] = String(value);
  }

  return tags;
}

function attributeString(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  return undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}
