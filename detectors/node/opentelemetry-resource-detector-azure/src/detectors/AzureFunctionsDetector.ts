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

import {
    DetectorSync,
    IResource,
    Resource
} from '@opentelemetry/resources';

import {
    CloudProviderValues,
    CloudPlatformValues,
    SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';

const FUNCTION_NAME = 'WEBSITE_SITE_NAME';
const FUNCTIONS_VERSION = 'FUNCTIONS_EXTENSION_VERSION';
const FUNCTIONS_INSTANCE = 'WEBSITE_INSTANCE_ID';
const FUNCTIONS_MEM_LIMIT = 'WEBSITE_MEMORY_LIMIT_MB';
const FUNCTIONS_REGION = 'REGION_NAME';

const AZURE_FUNCTIONS_ATTRIBUTE_ENV_VARS = {
    [SemanticResourceAttributes.FAAS_NAME]: FUNCTION_NAME,
    [SemanticResourceAttributes.FAAS_VERSION]: FUNCTIONS_VERSION,
    [SemanticResourceAttributes.FAAS_INSTANCE]: FUNCTIONS_INSTANCE,
    [SemanticResourceAttributes.FAAS_MAX_MEMORY]: FUNCTIONS_MEM_LIMIT,
};

/**
 * The AzureFunctionsDetector can be used to detect if a process is running in Azure Functions
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureFunctionsDetector implements DetectorSync {
    detect(): IResource {
        let attributes = {};
        const functionName = process.env[FUNCTION_NAME];
        if (functionName) {
            const functionVersion = process.env[FUNCTIONS_VERSION];
            const functionInstance = process.env[FUNCTIONS_INSTANCE];
            const functionMemLimit = process.env[FUNCTIONS_MEM_LIMIT];
    
            attributes = {
                [SemanticResourceAttributes.CLOUD_PROVIDER]: CloudProviderValues.AZURE,
                [SemanticResourceAttributes.CLOUD_PLATFORM]: CloudPlatformValues.AZURE_FUNCTIONS,
                [SemanticResourceAttributes.CLOUD_REGION]: process.env[FUNCTIONS_REGION],
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
