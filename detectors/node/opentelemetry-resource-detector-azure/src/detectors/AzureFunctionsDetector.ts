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
  SEMRESATTRS_FAAS_MAX_MEMORY,
  SEMRESATTRS_FAAS_INSTANCE,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_PLATFORM,
  SEMRESATTRS_CLOUD_REGION,
  CLOUDPROVIDERVALUES_AZURE,
  CLOUDPLATFORMVALUES_AZURE_FUNCTIONS,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_PROCESS_PID,
} from '@opentelemetry/semantic-conventions';
import {
  WEBSITE_SITE_NAME,
  FUNCTIONS_VERSION,
  WEBSITE_INSTANCE_ID,
  FUNCTIONS_MEM_LIMIT,
  REGION_NAME,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
} from '../types';
import { getAzureResourceUri } from '../utils';

const AZURE_FUNCTIONS_ATTRIBUTE_ENV_VARS = {
  [SEMRESATTRS_SERVICE_NAME]: WEBSITE_SITE_NAME,
  [SEMRESATTRS_FAAS_INSTANCE]: WEBSITE_INSTANCE_ID,
  [SEMRESATTRS_FAAS_MAX_MEMORY]: FUNCTIONS_MEM_LIMIT,
};

/**
 * The AzureFunctionsDetector can be used to detect if a process is running in Azure Functions
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureFunctionsDetector implements DetectorSync {
  detect(): IResource {
    let attributes = {};
    const serviceName = process.env[WEBSITE_SITE_NAME];
    const functionVersion = process.env[FUNCTIONS_VERSION];
    if (serviceName && functionVersion) {
      const functionInstance = process.env[WEBSITE_INSTANCE_ID];
      const functionMemLimit = process.env[FUNCTIONS_MEM_LIMIT];

      attributes = {
        [SEMRESATTRS_CLOUD_PROVIDER]: CLOUDPROVIDERVALUES_AZURE,
        [SEMRESATTRS_CLOUD_PLATFORM]: CLOUDPLATFORMVALUES_AZURE_FUNCTIONS,
        [SEMRESATTRS_CLOUD_REGION]: process.env[REGION_NAME],
        [SEMRESATTRS_PROCESS_PID]: process.pid,
      };

      if (serviceName) {
        attributes = {
          ...attributes,
          [SEMRESATTRS_SERVICE_NAME]: serviceName,
        };
      }
      if (functionInstance) {
        attributes = {
          ...attributes,
          [SEMRESATTRS_FAAS_INSTANCE]: functionInstance,
        };
      }
      if (functionMemLimit) {
        attributes = {
          ...attributes,
          [SEMRESATTRS_FAAS_MAX_MEMORY]: functionMemLimit,
        };
      }
      const azureResourceUri = getAzureResourceUri(serviceName);
      if (azureResourceUri) {
        attributes = {
          ...attributes,
          ...{ [CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: azureResourceUri },
        };
      }

      for (const [key, value] of Object.entries(
        AZURE_FUNCTIONS_ATTRIBUTE_ENV_VARS
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

export const azureFunctionsDetector = new AzureFunctionsDetector();
