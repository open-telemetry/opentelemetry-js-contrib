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
  AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE,
  REGION_NAME,
  WEBSITE_HOME_STAMPNAME,
  WEBSITE_HOSTNAME,
  WEBSITE_INSTANCE_ID,
  WEBSITE_SITE_NAME,
  WEBSITE_SLOT_NAME,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
} from '../types';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  ATTR_CLOUD_REGION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_HOST_ID,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_CLOUD_PROVIDER,
  CLOUD_PROVIDER_VALUE_AZURE,
  ATTR_CLOUD_PLATFORM,
  CLOUD_PLATFORM_VALUE_AZURE_APP_SERVICE,
} from '../semconv';
import { getAzureResourceUri, isAzureFunction } from '../utils';

const APP_SERVICE_ATTRIBUTE_ENV_VARS = {
  [ATTR_CLOUD_REGION]: REGION_NAME,
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: WEBSITE_SLOT_NAME,
  [ATTR_HOST_ID]: WEBSITE_HOSTNAME,
  [ATTR_SERVICE_INSTANCE_ID]: WEBSITE_INSTANCE_ID,
  [AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE]: WEBSITE_HOME_STAMPNAME,
};

/**
 * The AzureAppServiceDetector can be used to detect if a process is running in an Azure App Service
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureAppServiceDetector implements ResourceDetector {
  detect(): DetectedResource {
    let attributes = {};
    const websiteSiteName = process.env[WEBSITE_SITE_NAME];
    if (websiteSiteName && !isAzureFunction()) {
      attributes = {
        ...attributes,
        [ATTR_SERVICE_NAME]: websiteSiteName,
      };
      attributes = {
        ...attributes,
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AZURE,
      };
      attributes = {
        ...attributes,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AZURE_APP_SERVICE,
      };

      const azureResourceUri = getAzureResourceUri(websiteSiteName);
      if (azureResourceUri) {
        attributes = {
          ...attributes,
          ...{ [CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: azureResourceUri },
        };
      }

      for (const [key, value] of Object.entries(
        APP_SERVICE_ATTRIBUTE_ENV_VARS
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

export const azureAppServiceDetector = new AzureAppServiceDetector();
