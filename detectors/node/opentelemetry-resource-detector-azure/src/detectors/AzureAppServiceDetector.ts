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
    Resource,
    ResourceDetectionConfig,
  } from '@opentelemetry/resources';

import {
CloudProviderValues,
CloudPlatformValues,
SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';

const AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE = "azure.app.service.stamp";
// TODO: Remove once this resource attribute is no longer missing from SDK
const CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE = "cloud.resource_id";
const REGION_NAME = "REGION_NAME";
const WEBSITE_HOME_STAMPNAME = "WEBSITE_HOME_STAMPNAME";
const WEBSITE_HOSTNAME = "WEBSITE_HOSTNAME";
const WEBSITE_INSTANCE_ID = "WEBSITE_INSTANCE_ID";
const WEBSITE_OWNER_NAME = "WEBSITE_OWNER_NAME";
const WEBSITE_RESOURCE_GROUP = "WEBSITE_RESOURCE_GROUP";
const WEBSITE_SITE_NAME = "WEBSITE_SITE_NAME";
const WEBSITE_SLOT_NAME = "WEBSITE_SLOT_NAME";

const APP_SERVICE_ATTRIBUTE_ENV_VARS = {
    [SemanticResourceAttributes.CLOUD_REGION]: REGION_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: WEBSITE_SLOT_NAME,
    [SemanticResourceAttributes.HOST_ID]: WEBSITE_HOSTNAME,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: WEBSITE_INSTANCE_ID,
    [AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE]: WEBSITE_HOME_STAMPNAME,
};

class AzureAppServiceDetector implements DetectorSync {
    detect(config?: ResourceDetectionConfig): IResource {
        let attributes = {};
        const websiteSiteName = process.env[WEBSITE_SITE_NAME];
        if (websiteSiteName) {
            attributes = { ...attributes, [SemanticResourceAttributes.SERVICE_NAME]: websiteSiteName };
            attributes = { ...attributes, [SemanticResourceAttributes.CLOUD_PROVIDER]: CloudProviderValues.AZURE };
            attributes = {...attributes, [SemanticResourceAttributes.CLOUD_PLATFORM]: CloudPlatformValues.AZURE_APP_SERVICE };

            const azureResourceUri = this.getAzureResourceUri(websiteSiteName);
            if (azureResourceUri) {
                attributes = {...attributes, ...{[CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: azureResourceUri}};
            }

            for(const [key, value] of Object.entries(APP_SERVICE_ATTRIBUTE_ENV_VARS)) {
                const envVar = process.env[value];
                if (envVar) {
                    attributes = {...attributes, ...{[key]: envVar}};
                }
            }
        }
        return new Resource(attributes);
    }

    getAzureResourceUri(websiteSiteName: string): string | undefined {
        const websiteResourceGroup = process.env[WEBSITE_RESOURCE_GROUP];
        const websiteOwnerName = process.env[WEBSITE_OWNER_NAME];

        let subscriptionId = websiteOwnerName;
        if (websiteOwnerName && websiteOwnerName.indexOf("+") !== -1) {
            subscriptionId = websiteOwnerName.split("+")[0];
        }

        if (!subscriptionId && !websiteOwnerName) {
            return undefined;
        }

        return `/subscriptions/${subscriptionId}/resourceGroups/${websiteResourceGroup}/providers/Microsoft.Web/sites/${websiteSiteName}`;
    }
}

export const azureAppServiceDetector = new AzureAppServiceDetector();
