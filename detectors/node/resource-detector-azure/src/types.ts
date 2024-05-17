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

export const AZURE_APP_SERVICE_STAMP_RESOURCE_ATTRIBUTE =
  'azure.app.service.stamp';
export const CLOUD_RESOURCE_ID_RESOURCE_ATTRIBUTE = 'cloud.resource_id';
export const REGION_NAME = 'REGION_NAME';
export const WEBSITE_HOME_STAMPNAME = 'WEBSITE_HOME_STAMPNAME';
export const WEBSITE_HOSTNAME = 'WEBSITE_HOSTNAME';
export const WEBSITE_INSTANCE_ID = 'WEBSITE_INSTANCE_ID';
export const WEBSITE_OWNER_NAME = 'WEBSITE_OWNER_NAME';
export const WEBSITE_RESOURCE_GROUP = 'WEBSITE_RESOURCE_GROUP';
export const WEBSITE_SITE_NAME = 'WEBSITE_SITE_NAME';
export const WEBSITE_SLOT_NAME = 'WEBSITE_SLOT_NAME';

export const FUNCTIONS_VERSION = 'FUNCTIONS_EXTENSION_VERSION';
export const FUNCTIONS_MEM_LIMIT = 'WEBSITE_MEMORY_LIMIT_MB';

export const AZURE_VM_METADATA_HOST = '169.254.169.254';
export const AZURE_VM_METADATA_PATH =
  '/metadata/instance/compute?api-version=2021-12-13&format=json';
export const AZURE_VM_SCALE_SET_NAME_ATTRIBUTE = 'azure.vm.scaleset.name';
export const AZURE_VM_SKU_ATTRIBUTE = 'azure.vm.sku';

export interface AzureVmMetadata {
  azEnvironment?: string;
  additionalCapabilities?: {
    hibernationEnabled?: string;
  };
  hostGroup?: {
    id?: string;
  };
  host?: {
    id?: string;
  };
  extendedLocation?: {
    type?: string;
    name?: string;
  };
  evictionPolicy?: string;
  isHostCompatibilityLayerVm?: string;
  licenseType?: string;
  location: string;
  name: string;
  offer?: string;
  osProfile?: {
    adminUsername?: string;
    computerName?: string;
    disablePasswordAuthentication?: string;
  };
  osType?: string;
  placementGroupId?: string;
  plan?: {
    name?: string;
    product?: string;
    publisher?: string;
  };
  platformFaultDomain?: string;
  platformSubFaultDomain?: string;
  platformUpdateDomain?: string;
  priority?: string;
  provider?: string;
  publicKeys?: [
    {
      keyData?: string;
      path?: string;
    },
    {
      keyData?: string;
      path?: string;
    }
  ];
  publisher?: string;
  resourceGroupName?: string;
  resourceId: string;
  securityProfile?: {
    secureBootEnabled?: string;
    virtualTpmEnabled?: string;
    encryptionAtHost?: string;
    securityType?: string;
  };
  sku: string;
  storageProfile?: {
    dataDisks?: [
      {
        bytesPerSecondThrottle?: string;
        caching?: string;
        createOption?: string;
        diskCapacityBytes?: string;
        diskSizeGB?: string;
        image?: {
          uri?: string;
        };
        isSharedDisk?: string;
        isUltraDisk?: string;
        lun?: string;
        managedDisk?: {
          id?: string;
          storageAccountType?: string;
        };
        name: string;
        opsPerSecondThrottle?: string;
        vhd?: {
          uri?: string;
        };
        writeAcceleratorEnabled?: string;
      }
    ];
    imageReference?: {
      id?: string;
      offer?: string;
      publisher?: string;
      sku?: string;
      version?: string;
    };
    osDisk?: {
      caching?: string;
      createOption?: string;
      diskSizeGB?: string;
      diffDiskSettings?: {
        option?: string;
      };
      encryptionSettings?: {
        enabled?: string;
        diskEncryptionKey?: {
          sourceVault?: {
            id?: string;
          };
          secretUrl?: string;
        };
        keyEncryptionKey?: {
          sourceVault?: {
            id?: string;
          };
          keyUrl?: string;
        };
      };
      image?: {
        uri?: string;
      };
      managedDisk?: {
        id?: string;
        storageAccountType?: string;
      };
      name?: string;
      osType?: string;
      vhd?: {
        uri?: string;
      };
      writeAcceleratorEnabled?: string;
    };
    resourceDisk?: {
      size?: string;
    };
  };
  subscriptionId?: string;
  tags?: string;
  tagsList?: object[];
  customData?: string;
  userData?: string;
  version: string;
  virtualMachineScaleSet?: {
    id?: string;
  };
  vmId: string;
  vmScaleSetName: string;
  vmSize: string;
  zone?: string;
}
