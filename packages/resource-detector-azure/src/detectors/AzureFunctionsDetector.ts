/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  ATTR_FAAS_MAX_MEMORY,
  ATTR_FAAS_INSTANCE,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_PROVIDER,
  CLOUD_PROVIDER_VALUE_AZURE,
  ATTR_CLOUD_PLATFORM,
  CLOUD_PLATFORM_VALUE_AZURE_FUNCTIONS,
  ATTR_CLOUD_REGION,
  ATTR_PROCESS_PID,
} from '../semconv';
import {
  AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE,
  WEBSITE_SITE_NAME,
  WEBSITE_INSTANCE_ID,
  FUNCTIONS_MEM_LIMIT,
  REGION_NAME,
  WEBSITE_RESOURCE_GROUP,
  CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
} from '../types';
import {
  getAzureResourceUri,
  getAzureSubscriptionId,
  isAzureFunction,
} from '../utils';

const AZURE_FUNCTIONS_ATTRIBUTE_ENV_VARS = {
  [AZURE_RESOURCE_GROUP_NAME_ATTRIBUTE]: WEBSITE_RESOURCE_GROUP,
  [ATTR_SERVICE_NAME]: WEBSITE_SITE_NAME,
  [ATTR_FAAS_INSTANCE]: WEBSITE_INSTANCE_ID,
  [ATTR_FAAS_MAX_MEMORY]: FUNCTIONS_MEM_LIMIT,
};

/**
 * The AzureFunctionsDetector can be used to detect if a process is running in Azure Functions
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureFunctionsDetector implements ResourceDetector {
  public detect(): DetectedResource {
    let attributes = {};
    const serviceName = process.env[WEBSITE_SITE_NAME];

    /**
     * Checks that we are operating within an Azure Function using the function version since WEBSITE_SITE_NAME
     * will exist in Azure App Service as well and detectors should be mutually exclusive.
     * If the function version is not present, we check for the website sku to determine if it is a function.
     */
    if (serviceName && isAzureFunction()) {
      const functionInstance = process.env[WEBSITE_INSTANCE_ID];
      const functionMemLimit = process.env[FUNCTIONS_MEM_LIMIT];

      attributes = {
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AZURE,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AZURE_FUNCTIONS,
        [ATTR_CLOUD_REGION]: process.env[REGION_NAME],
        [ATTR_PROCESS_PID]: process.pid,
      };

      if (serviceName) {
        attributes = {
          ...attributes,
          [ATTR_SERVICE_NAME]: serviceName,
        };
      }
      if (functionInstance) {
        attributes = {
          ...attributes,
          [ATTR_FAAS_INSTANCE]: functionInstance,
        };
      }
      if (functionMemLimit) {
        attributes = {
          ...attributes,
          [ATTR_FAAS_MAX_MEMORY]: functionMemLimit,
        };
      }
      const azureResourceUri = getAzureResourceUri(serviceName);
      if (azureResourceUri) {
        attributes = {
          ...attributes,
          ...{ [CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: azureResourceUri },
        };
      }

      const subscriptionId = getAzureSubscriptionId();
      if (subscriptionId) {
        attributes = {
          ...attributes,
          [ATTR_CLOUD_ACCOUNT_ID]: subscriptionId,
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
    return { attributes };
  }
}

export const azureFunctionsDetector = new AzureFunctionsDetector();
