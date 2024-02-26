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
  Detector,
  Resource,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';

import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import * as fs from 'fs';
import * as util from 'util';
import { diag } from '@opentelemetry/api';

const { KubeConfig, CoreV1Api } = require('@kubernetes/client-node');
require('dotenv').config();

export class ContainerDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_V1_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';
  readonly HOSTNAME = 'hostname';

  private static readFileAsync = util.promisify(fs.readFile);

  async detect(_config?: ResourceDetectionConfig): Promise<Resource> {
    try {
      let containerId = '';
      if (this._isInKubernetesEnvironment()) {
        containerId = await this._getContainerIdK8();
      } else {
        containerId = (await this._getContainerId()) || '';
      }
      return !containerId
        ? Resource.empty()
        : new Resource({
            [SemanticResourceAttributes.CONTAINER_ID]: containerId,
          });
    } catch (e) {
      diag.info(
        'Container Detector did not identify running inside a supported container, no container attributes will be added to resource: ',
        e
      );
      return Resource.empty();
    }
  }

  private async _getContainerIdV1() {
    const rawData = await ContainerDetector.readFileAsync(
      this.DEFAULT_CGROUP_V1_PATH,
      this.UTF8_UNICODE
    );
    const splitData = rawData.trim().split('\n');
    for (const str of splitData) {
      if (str.length >= this.CONTAINER_ID_LENGTH) {
        return str.substring(str.length - this.CONTAINER_ID_LENGTH);
      }
    }
    return undefined;
  }

  private async _getContainerIdV2() {
    const rawData = await ContainerDetector.readFileAsync(
      this.DEFAULT_CGROUP_V2_PATH,
      this.UTF8_UNICODE
    );
    const str = rawData
      .trim()
      .split('\n')
      .find(s => s.includes(this.HOSTNAME));
    const containerIdStr = str
      ?.split('/')
      .find(s => s.length === this.CONTAINER_ID_LENGTH);
    return containerIdStr || '';
  }

  private _isInKubernetesEnvironment(): boolean {
    return process.env.KUBERNETES_SERVICE_HOST !== undefined;
  }

  private async _getContainerIdK8(): Promise<string> {
    const kubeconfig = new KubeConfig();
    kubeconfig.loadFromDefault();

    const api = kubeconfig.makeApiClient(CoreV1Api);
    const namespace: string = process.env.NAMESPACE || 'default';
    const containerName: string | undefined = process.env.CONTAINER_NAME;
    if (!containerName) {
      throw new Error('Container name not specified in environment');
    }

    const response = await api.listNamespacePod(namespace);

    const podWithContainer = response.body.items.find(
      (pod: { spec: { containers: any[] } }) => {
        return pod.spec.containers.some(
          container => container.name === containerName
        );
      }
    );

    if (!podWithContainer) {
      throw new Error(`No pods found with container name '${containerName}'.`);
    }

    const container = podWithContainer.spec.containers.find(
      (container: { name: string }) => container.name === containerName
    );
    const containerId = container ? container.containerID || '' : '';

    return containerId;
  }

  /*
    cgroupv1 path would still exist in case of container running on v2
    but the cgroupv1 path would no longer have the container id and would
    fallback on the cgroupv2 implementation.
  */
  private async _getContainerId(): Promise<string | undefined> {
    try {
      return (
        (await this._getContainerIdV1()) ?? (await this._getContainerIdV2())
      );
    } catch (e) {
      if (e instanceof Error) {
        const errorMessage = e.message;
        diag.info(
          'Container Detector failed to read the Container ID: ',
          errorMessage
        );
      }
    }
    return undefined;
  }
}

export const containerDetector = new ContainerDetector();
