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

import { DetectorSync, IResource, Resource } from '@opentelemetry/resources';
import {
  AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE,
  REGION_NAME,
  WEBSITE_HOME_STAMPNAME,
  WEBSITE_HOSTNAME,
  WEBSITE_INSTANCE_ID,
  WEBSITE_SITE_NAME,
  WEBSITE_SLOT_NAME,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
  FUNCTIONS_VERSION,
} from '../types';
import {
  SEMRESATTRS_CLOUD_REGION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_HOST_ID,
  SEMRESATTRS_SERVICE_INSTANCE_ID,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_PLATFORM,
  CLOUDPROVIDERVALUES_AZURE,
  CLOUDPLATFORMVALUES_AZURE_APP_SERVICE,
} from '@opentelemetry/semantic-conventions';
import { getAzureResourceUri } from '../utils';

const APP_SERVICE_ATTRIBUTE_ENV_VARS = {
  [SEMRESATTRS_CLOUD_REGION]: REGION_NAME,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: WEBSITE_SLOT_NAME,
  [SEMRESATTRS_HOST_ID]: WEBSITE_HOSTNAME,
  [SEMRESATTRS_SERVICE_INSTANCE_ID]: WEBSITE_INSTANCE_ID,
  [AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE]: WEBSITE_HOME_STAMPNAME,
};

/**
 * The AzureAppServiceDetector can be used to detect if a process is running in an Azure App Service
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureAppServiceDetector implements DetectorSync {
  detect(): IResource {
    let attributes = {};
    const websiteSiteName = process.env[WEBSITE_SITE_NAME];
    const isAzureFunction = !!process.env[FUNCTIONS_VERSION];
    if (websiteSiteName && !isAzureFunction) {
      attributes = {
        ...attributes,
        [SEMRESATTRS_SERVICE_NAME]: websiteSiteName,
      };
      attributes = {
        ...attributes,
        [SEMRESATTRS_CLOUD_PROVIDER]: CLOUDPROVIDERVALUES_AZURE,
      };
      attributes = {
        ...attributes,
        [SEMRESATTRS_CLOUD_PLATFORM]: CLOUDPLATFORMVALUES_AZURE_APP_SERVICE,
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
    return new Resource(attributes);
  }
}

export const azureAppServiceDetector = new AzureAppServiceDetector();
