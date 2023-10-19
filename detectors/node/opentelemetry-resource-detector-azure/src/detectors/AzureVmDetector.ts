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

import * as http from 'http';
import {
  DetectorSync,
  IResource,
  Resource,
  ResourceAttributes,
} from '@opentelemetry/resources';
import {
  CloudPlatformValues,
  CloudProviderValues,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';

const CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE = 'cloud.resource_id';
const AZURE_VM_METADATA_HOST = '169.254.169.254';
const AZURE_VM_METADATA_PATH =
  '/metadata/instance/compute?api-version=2021-12-13&format=json';
const AZURE_VM_SCALE_SET_NAME_ATTRIBUTE = 'azure.vm.scaleset.name';
const AZURE_VM_SKU_ATTRIBUTE = 'azure.vm.sku';

/**
 * The AzureVmDetector can be used to detect if a process is running in an Azure VM.
 * @returns a {@link Resource} populated with data about the environment or an empty Resource if detection fails.
 */
class AzureVmResourceDetector implements DetectorSync {
  detect(): IResource {
    const resourceAttributes: Promise<ResourceAttributes> =
      this.getAzureVmMetadata();
    return new Resource({}, resourceAttributes);
  }

  async getAzureVmMetadata(): Promise<ResourceAttributes> {
    let attributes: any = {};
    const options = {
      host: AZURE_VM_METADATA_HOST,
      path: AZURE_VM_METADATA_PATH,
      method: 'GET',
      timeout: 5000,
      headers: {
        Metadata: 'True',
      },
    };
    const metadata: any = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        req.destroy();
        reject(new Error('Azure metadata service request timed out.'));
      }, 1000);

      const req = http.request(options, res => {
        clearTimeout(timeoutId);
        const { statusCode } = res;
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => {
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            try {
              resolve(JSON.parse(rawData));
            } catch (error) {
              reject(error);
            }
          } else {
            reject(
              new Error('Failed to load page, status code: ' + statusCode)
            );
          }
        });
      });
      req.on('error', err => {
        clearTimeout(timeoutId);
        reject(err);
      });
      req.end();
    });

    attributes = {
      [AZURE_VM_SCALE_SET_NAME_ATTRIBUTE]: metadata['vmScaleSetName'],
      [AZURE_VM_SKU_ATTRIBUTE]: metadata['sku'],
      [SemanticResourceAttributes.CLOUD_PLATFORM]: CloudPlatformValues.AZURE_VM,
      [SemanticResourceAttributes.CLOUD_PROVIDER]: CloudProviderValues.AZURE,
      [SemanticResourceAttributes.CLOUD_REGION]: metadata['location'],
      [CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE]: metadata['resourceId'],
      [SemanticResourceAttributes.HOST_ID]: metadata['vmId'],
      [SemanticResourceAttributes.HOST_NAME]: metadata['name'],
      [SemanticResourceAttributes.HOST_TYPE]: metadata['vmSize'],
      [SemanticResourceAttributes.OS_VERSION]: metadata['version'],
    };
    return attributes;
  }
}

export const azureVmDetector = new AzureVmResourceDetector();
