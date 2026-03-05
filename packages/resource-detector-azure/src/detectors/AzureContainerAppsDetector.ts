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
  CONTAINER_APP_REVISION
} from '../types';

const CONTAINER_APP_ATTRIBUTE_ENV_VARS = {
  [ATTR_HOST_NAME]: CONTAINER_APP_HOSTNAME,
  [AZURE_CONTAINER_APP_INSTANCE_ID]: CONTAINER_APP_REPLICA_NAME,
  [AZURE_CONTAINER_APP_NAME]: CONTAINER_APP_NAME,
  [AZURE_CONTAINER_APP_VERSION]: CONTAINER_APP_REVISION,
}

class AzureContainerAppsDetector implements ResourceDetector {
  detect(): DetectedResource {
    let attributes = {};

    if (isAzureContainerApps()) {
      attributes = {
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AZURE_CONTAINER_APPS,
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AZURE,
      };

      for (const [key, value] of Object.entries(CONTAINER_APP_ATTRIBUTE_ENV_VARS)) {
        const envVar = process.env[value];
        if (envVar) {
          attributes = { ...attributes, ...{ [key]: envVar } };
        }
      }
    }
    return { attributes }
  }
}

export const azureContainerAppsDetector = new AzureContainerAppsDetector();

