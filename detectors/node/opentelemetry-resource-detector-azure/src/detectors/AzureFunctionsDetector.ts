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
  CloudProviderValues,
  CloudPlatformValues,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import {
  WEBSITE_SITE_NAME,
  FUNCTIONS_VERSION,
  WEBSITE_INSTANCE_ID,
  FUNCTIONS_MEM_LIMIT,
  REGION_NAME,
} from '../types';

const AZURE_FUNCTIONS_ATTRIBUTE_ENV_VARS = {
  [SemanticResourceAttributes.FAAS_NAME]: WEBSITE_SITE_NAME,
  [SemanticResourceAttributes.FAAS_VERSION]: FUNCTIONS_VERSION,
  [SemanticResourceAttributes.FAAS_INSTANCE]: WEBSITE_INSTANCE_ID,
  [SemanticResourceAttributes.FAAS_MAX_MEMORY]: FUNCTIONS_MEM_LIMIT,
};

/**
 * The AzureFunctionsDetector can be used to detect if a process is running in Azure Functions
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureFunctionsDetector implements DetectorSync {
  detect(): IResource {
    let attributes = {};
    const functionName = process.env[WEBSITE_SITE_NAME];
    const functionVersion = process.env[FUNCTIONS_VERSION];
    if (functionName && functionVersion) {
      const functionInstance = process.env[WEBSITE_INSTANCE_ID];
      const functionMemLimit = process.env[FUNCTIONS_MEM_LIMIT];

      attributes = {
        [SemanticResourceAttributes.CLOUD_PROVIDER]: CloudProviderValues.AZURE,
        [SemanticResourceAttributes.CLOUD_PLATFORM]:
          CloudPlatformValues.AZURE_FUNCTIONS,
        [SemanticResourceAttributes.CLOUD_REGION]: process.env[REGION_NAME],
      };

      if (functionName) {
        attributes = {
          ...attributes,
          [SemanticResourceAttributes.FAAS_NAME]: functionName,
        };
      }
      if (functionVersion) {
        attributes = {
          ...attributes,
          [SemanticResourceAttributes.FAAS_VERSION]: functionVersion,
        };
      }
      if (functionInstance) {
        attributes = {
          ...attributes,
          [SemanticResourceAttributes.FAAS_INSTANCE]: functionInstance,
        };
      }
      if (functionMemLimit) {
        attributes = {
          ...attributes,
          [SemanticResourceAttributes.FAAS_MAX_MEMORY]: functionMemLimit,
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
