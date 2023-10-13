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

import { diag } from '@opentelemetry/api';
import { DetectorSync, IResource, Resource, ResourceDetectionConfig } from '@opentelemetry/resources';
import { CloudPlatformValues, CloudProviderValues, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE = 'cloud.resource_id';
const AZURE_VM_METADATA_ENDPOINT = 'http://169.254.169.254/metadata/instance/compute?api-version=2021-12-13&format=json';
const AZURE_VM_SCALE_SET_NAME_ATTRIBUTE = 'azure.vm.scaleset.name';
const AZURE_VM_SKU_ATTRIBUTE = 'azure.vm.sku';

const expectedAzureAmsAttributes = [
    AZURE_VM_SCALE_SET_NAME_ATTRIBUTE,
    AZURE_VM_SKU_ATTRIBUTE,
    SemanticResourceAttributes.CLOUD_PLATFORM,
    SemanticResourceAttributes.CLOUD_PROVIDER,
    SemanticResourceAttributes.CLOUD_REGION,
    CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE,
    SemanticResourceAttributes.HOST_ID,
    SemanticResourceAttributes.HOST_NAME,
    SemanticResourceAttributes.HOST_TYPE,
    SemanticResourceAttributes.OS_VERSION,
    SemanticResourceAttributes.SERVICE_INSTANCE_ID,
];

class AzureVmResourceDetector implements DetectorSync {
    detect(config?: ResourceDetectionConfig): IResource {
        let attributes: any = {};
        const metadataJson = this.getAzureVmMetadata();
        if (!metadataJson) {
            return new Resource(attributes);
        }
        for (const attribute of expectedAzureAmsAttributes) {
            // attributes = { ...attributes, [attribute]: this.getAttributeFromMetadata(metadataJson, attribute) };
            attributes[attribute] = this.getAttributeFromMetadata(metadataJson, attribute);
            console.log("ATTRIBUTE: ", attributes[attribute]);
        }
        console.log("TEST OBJECT: ", new Resource(attributes));
        return new Resource(attributes, this.getAzureVmMetadata());
    }

    async getAzureVmMetadata(): Promise<any> {
        fetch(AZURE_VM_METADATA_ENDPOINT, {
            method: 'GET',
            headers: {
                'Metadata': 'true'
            }
        })
        .then(response => {
            return response.json();
        })
        .catch(error => {
            diag.warn('Error fetching Azure VM metadata: ', error);
        });
    }

    private getAttributeFromMetadata(metadataJson: any, attribute: string): string {
        let amsValue = "";
        if (attribute == AZURE_VM_SCALE_SET_NAME_ATTRIBUTE) {
            console.log("TEST: ", metadataJson);
            amsValue = metadataJson['vmScaleSetName'];
        } else if (attribute == AZURE_VM_SKU_ATTRIBUTE) {
            amsValue = metadataJson['sku'];
        } else if (attribute == SemanticResourceAttributes.CLOUD_PLATFORM) {
            amsValue = CloudPlatformValues.AZURE_VM;
        } else if (attribute == SemanticResourceAttributes.CLOUD_PROVIDER) {
            amsValue = CloudProviderValues.AZURE;
        } else if (attribute == SemanticResourceAttributes.CLOUD_REGION) {
            amsValue = metadataJson['location'];
        } else if (attribute == CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE) {
            amsValue = metadataJson['resourceId'];
        } else if (attribute == SemanticResourceAttributes.HOST_ID || attribute == SemanticResourceAttributes.SERVICE_INSTANCE_ID) {
            amsValue = metadataJson['vmId'];
        } else if (attribute == SemanticResourceAttributes.HOST_NAME) {
            amsValue = metadataJson['name'];
        } else if (attribute == SemanticResourceAttributes.HOST_TYPE) {
            amsValue = metadataJson['vmSize'];
        } else if (attribute == SemanticResourceAttributes.OS_VERSION) {
            amsValue = metadataJson['version'];
        }
        return amsValue;
    }
}

export const azureVmDetector = new AzureVmResourceDetector();
