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

import * as assert from 'assert';
import * as nock from 'nock';
import { azureVmDetector } from '../../src/detectors/AzureVmDetector';
import { IResource } from '@opentelemetry/resources';
import { AzureVmMetadata } from '../../src/types';

const linuxTestResponse: AzureVmMetadata = {
  additionalCapabilities: {
    hibernationEnabled: 'false',
  },
  azEnvironment: 'AzurePublicCloud',
  customData: '',
  evictionPolicy: '',
  extendedLocation: {
    name: '',
    type: '',
  },
  host: {
    id: '',
  },
  hostGroup: {
    id: '',
  },
  isHostCompatibilityLayerVm: 'true',
  licenseType: '',
  location: 'westus',
  name: 'examplevmname',
  offer: '0001-com-ubuntu-server-focal',
  osProfile: {
    adminUsername: 'azureuser',
    computerName: 'examplevmname',
    disablePasswordAuthentication: 'true',
  },
  osType: 'Linux',
  placementGroupId: '',
  plan: {
    name: '',
    product: '',
    publisher: '',
  },
  platformFaultDomain: '0',
  platformSubFaultDomain: '',
  platformUpdateDomain: '0',
  priority: '',
  provider: 'Microsoft.Compute',
  publicKeys: [
    {
      keyData: 'ssh-rsa 0',
      path: '/home/user/.ssh/authorized_keys0',
    },
    {
      keyData: 'ssh-rsa 1',
      path: '/home/user/.ssh/authorized_keys1',
    },
  ],
  publisher: 'canonical',
  resourceGroupName: 'macikgo-test-may-23',
  resourceId:
    '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname',
  securityProfile: {
    encryptionAtHost: 'false',
    secureBootEnabled: 'true',
    securityType: 'TrustedLaunch',
    virtualTpmEnabled: 'true',
  },
  sku: '20_04-lts-gen2',
  storageProfile: {
    dataDisks: [
      {
        bytesPerSecondThrottle: '979202048',
        caching: 'None',
        createOption: 'Empty',
        diskCapacityBytes: '274877906944',
        diskSizeGB: '1024',
        image: {
          uri: '',
        },
        isSharedDisk: 'false',
        isUltraDisk: 'true',
        lun: '0',
        managedDisk: {
          id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampledatadiskname',
          storageAccountType: 'StandardSSD_LRS',
        },
        name: 'exampledatadiskname',
        opsPerSecondThrottle: '65280',
        vhd: {
          uri: '',
        },
        writeAcceleratorEnabled: 'false',
      },
    ],
    imageReference: {
      id: '',
      offer: '0001-com-ubuntu-server-focal',
      publisher: 'canonical',
      sku: '20_04-lts-gen2',
      version: 'latest',
    },
    osDisk: {
      caching: 'ReadWrite',
      createOption: 'FromImage',
      diffDiskSettings: {
        option: '',
      },
      diskSizeGB: '30',
      encryptionSettings: {
        enabled: 'false',
        diskEncryptionKey: {
          sourceVault: {
            id: '/subscriptions/test-source-guid/resourceGroups/testrg/providers/Microsoft.KeyVault/vaults/test-kv',
          },
          secretUrl:
            'https://test-disk.vault.azure.net/secrets/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
        },
        keyEncryptionKey: {
          sourceVault: {
            id: '/subscriptions/test-key-guid/resourceGroups/testrg/providers/Microsoft.KeyVault/vaults/test-kv',
          },
          keyUrl:
            'https://test-key.vault.azure.net/secrets/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
        },
      },
      image: {
        uri: '',
      },
      managedDisk: {
        id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampleosdiskname',
        storageAccountType: 'StandardSSD_LRS',
      },
      name: 'exampledatadiskname',
      osType: 'Linux',
      vhd: {
        uri: '',
      },
      writeAcceleratorEnabled: 'false',
    },
    resourceDisk: {
      size: '16384',
    },
  },
  subscriptionId: 'xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
  tags: 'azsecpack:nonprod;platformsettings.host_environment.service.platform_optedin_for_rootcerts:true',
  tagsList: [
    {
      name: 'azsecpack',
      value: 'nonprod',
    },
    {
      name: 'platformsettings.host_environment.service.platform_optedin_for_rootcerts',
      value: 'true',
    },
  ],
  userData: '',
  version: '20.04.202307240',
  virtualMachineScaleSet: {
    id: '/subscriptions/xxxxxxxx-xxxxx-xxx-xxx-xxxx/resourceGroups/resource-group-name/providers/Microsoft.Compute/virtualMachineScaleSets/virtual-machine-scale-set-name',
  },
  vmId: '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
  vmScaleSetName: 'crpteste9vflji9',
  vmSize: 'Standard_A3',
  zone: '1',
};

const windowsTestResponse: AzureVmMetadata = {
  additionalCapabilities: {
    hibernationEnabled: 'false',
  },
  azEnvironment: 'AzurePublicCloud',
  customData: '',
  evictionPolicy: '',
  extendedLocation: {
    name: '',
    type: '',
  },
  host: {
    id: '',
  },
  hostGroup: {
    id: '',
  },
  isHostCompatibilityLayerVm: 'true',
  licenseType: 'Windows_Client',
  location: 'westus',
  name: 'examplevmname',
  offer: 'WindowsServer',
  osProfile: {
    adminUsername: 'azureuser',
    computerName: 'examplevmname',
    disablePasswordAuthentication: 'true',
  },
  osType: 'Windows',
  placementGroupId: '',
  plan: {
    name: '',
    product: '',
    publisher: '',
  },
  platformFaultDomain: '0',
  platformSubFaultDomain: '',
  platformUpdateDomain: '0',
  priority: '',
  provider: 'Microsoft.Compute',
  publicKeys: [
    {
      keyData: 'ssh-rsa 0',
      path: '/home/user/.ssh/authorized_keys0',
    },
    {
      keyData: 'ssh-rsa 1',
      path: '/home/user/.ssh/authorized_keys1',
    },
  ],
  publisher: 'RDFE-Test-Microsoft-Windows-Server-Group',
  resourceGroupName: 'macikgo-test-may-23',
  resourceId:
    '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname',
  securityProfile: {
    encryptionAtHost: 'false',
    secureBootEnabled: 'true',
    securityType: 'TrustedLaunch',
    virtualTpmEnabled: 'true',
  },
  sku: '2019-Datacenter',
  storageProfile: {
    dataDisks: [
      {
        bytesPerSecondThrottle: '979202048',
        caching: 'None',
        createOption: 'Empty',
        diskCapacityBytes: '274877906944',
        diskSizeGB: '1024',
        image: {
          uri: '',
        },
        isSharedDisk: 'false',
        isUltraDisk: 'true',
        lun: '0',
        managedDisk: {
          id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampledatadiskname',
          storageAccountType: 'StandardSSD_LRS',
        },
        name: 'exampledatadiskname',
        opsPerSecondThrottle: '65280',
        vhd: {
          uri: '',
        },
        writeAcceleratorEnabled: 'false',
      },
    ],
    imageReference: {
      id: '',
      offer: 'WindowsServer',
      publisher: 'MicrosoftWindowsServer',
      sku: '2019-Datacenter',
      version: 'latest',
    },
    osDisk: {
      caching: 'ReadWrite',
      createOption: 'FromImage',
      diffDiskSettings: {
        option: '',
      },
      diskSizeGB: '30',
      encryptionSettings: {
        enabled: 'false',
        diskEncryptionKey: {
          sourceVault: {
            id: '/subscriptions/test-source-guid/resourceGroups/testrg/providers/Microsoft.KeyVault/vaults/test-kv',
          },
          secretUrl:
            'https://test-disk.vault.azure.net/secrets/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
        },
        keyEncryptionKey: {
          sourceVault: {
            id: '/subscriptions/test-key-guid/resourceGroups/testrg/providers/Microsoft.KeyVault/vaults/test-kv',
          },
          keyUrl:
            'https://test-key.vault.azure.net/secrets/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
        },
      },
      image: {
        uri: '',
      },
      managedDisk: {
        id: '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampleosdiskname',
        storageAccountType: 'StandardSSD_LRS',
      },
      name: 'exampledatadiskname',
      osType: 'Windows',
      vhd: {
        uri: '',
      },
      writeAcceleratorEnabled: 'false',
    },
    resourceDisk: {
      size: '16384',
    },
  },
  subscriptionId: 'xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx',
  tags: 'azsecpack:nonprod;platformsettings.host_environment.service.platform_optedin_for_rootcerts:true',
  userData: 'Zm9vYmFy',
  tagsList: [
    {
      name: 'azsecpack',
      value: 'nonprod',
    },
    {
      name: 'platformsettings.host_environment.service.platform_optedin_for_rootcerts',
      value: 'true',
    },
  ],
  version: '20.04.202307240',
  virtualMachineScaleSet: {
    id: '/subscriptions/xxxxxxxx-xxxxx-xxx-xxx-xxxx/resourceGroups/resource-group-name/providers/Microsoft.Compute/virtualMachineScaleSets/virtual-machine-scale-set-name',
  },
  vmId: '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
  vmScaleSetName: 'crpteste9vflji9',
  vmSize: 'Standard_A3',
  zone: '1',
};

const linuxAttributes: any = {
  'azure.vm.scaleset.name': 'crpteste9vflji9',
  'azure.vm.sku': '20_04-lts-gen2',
  'cloud.platform': 'azure_vm',
  'cloud.provider': 'azure',
  'cloud.region': 'westus',
  'cloud.resource_id':
    '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname',
  'host.id': '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
  'host.name': 'examplevmname',
  'host.type': 'Standard_A3',
  'os.type': 'Linux',
  'os.version': '20.04.202307240',
  'service.instance.id': '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
};

const windowsAttributes: any = {
  'azure.vm.scaleset.name': 'crpteste9vflji9',
  'azure.vm.sku': '2019-Datacenter',
  'cloud.platform': 'azure_vm',
  'cloud.provider': 'azure',
  'cloud.region': 'westus',
  'cloud.resource_id':
    '/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname',
  'host.id': '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
  'host.name': 'examplevmname',
  'host.type': 'Standard_A3',
  'os.type': 'Windows',
  'os.version': '20.04.202307240',
  'service.instance.id': '02aab8a4-74ef-476e-8182-f6d2ba4166a6',
};

const AZURE_VM_METADATA_HOST = 'http://169.254.169.254';
const AZURE_VM_METADATA_PATH =
  '/metadata/instance/compute?api-version=2021-12-13&format=json';

describe('AzureAppServiceDetector', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.enableNetConnect();
  });

  it('should get linux virtual machine attributes', async () => {
    const scope = nock(AZURE_VM_METADATA_HOST)
      .get(AZURE_VM_METADATA_PATH)
      .reply(200, linuxTestResponse);

    const resource: IResource = azureVmDetector.detect();
    if (resource.waitForAsyncAttributes) {
      await resource.waitForAsyncAttributes();
    }
    const attributes = resource.attributes;
    for (let i = 0; i < Object.keys(attributes).length; i++) {
      const key = Object.keys(attributes)[i];
      assert.strictEqual(attributes[key], linuxAttributes[key]);
    }
    scope.done();
  });

  it('should get windows virtual machine attributes', async () => {
    const scope = nock(AZURE_VM_METADATA_HOST)
      .get(AZURE_VM_METADATA_PATH)
      .reply(200, windowsTestResponse);

    const resource: IResource = azureVmDetector.detect();
    if (resource.waitForAsyncAttributes) {
      await resource.waitForAsyncAttributes();
    }
    const attributes = resource.attributes;
    for (let i = 0; i < Object.keys(attributes).length; i++) {
      const key = Object.keys(attributes)[i];
      assert.strictEqual(attributes[key], windowsAttributes[key]);
    }
    scope.done();
  });
});
