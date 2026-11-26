/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';
import {
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_HOST_NAME,
  CLOUD_PLATFORM_VALUE_AZURE_CONTAINER_APPS,
  CLOUD_PROVIDER_VALUE_AZURE,
} from '../semconv';
import { isAzureContainerApps } from '../utils';
import {
  AZURE_CONTAINER_APP_INSTANCE_ID,
  AZURE_CONTAINER_APP_NAME,
  AZURE_CONTAINER_APP_VERSION,
  CONTAINER_APP_HOSTNAME,
  CONTAINER_APP_NAME,
  CONTAINER_APP_REPLICA_NAME,
  CONTAINER_APP_REVISION,
} from '../types';

const CONTAINER_APP_ATTRIBUTE_ENV_VARS = {
  [ATTR_HOST_NAME]: CONTAINER_APP_HOSTNAME,
  [AZURE_CONTAINER_APP_INSTANCE_ID]: CONTAINER_APP_REPLICA_NAME,
  [AZURE_CONTAINER_APP_NAME]: CONTAINER_APP_NAME,
  [AZURE_CONTAINER_APP_VERSION]: CONTAINER_APP_REVISION,
};

class AzureContainerAppsDetector implements ResourceDetector {
  public detect(): DetectedResource {
    let attributes = {};

    if (isAzureContainerApps()) {
      attributes = {
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AZURE_CONTAINER_APPS,
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AZURE,
      };

      for (const [key, value] of Object.entries(
        CONTAINER_APP_ATTRIBUTE_ENV_VARS
      )) {
        const envVar = process.env[value];
        if (envVar) {
          attributes = { ...attributes, ...{ [key]: envVar } };
        }
      }
    }
    return { attributes };
  }
}

export const azureContainerAppsDetector = new AzureContainerAppsDetector();
