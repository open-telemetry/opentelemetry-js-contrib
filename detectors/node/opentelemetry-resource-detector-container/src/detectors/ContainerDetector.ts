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

import { SEMRESATTRS_CONTAINER_ID } from '@opentelemetry/semantic-conventions';

import * as fs from 'fs';
import * as util from 'util';
import * as https from 'https';
import { RequestOptions } from 'https';
import { diag } from '@opentelemetry/api';

export class ContainerDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_V1_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';
  readonly HOSTNAME = 'hostname';
  readonly K8_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
  readonly K8_CERTIFICATE_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
  readonly K8_NAMESPACE_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
  private static readFileAsync = util.promisify(fs.readFile);

  async detect(_config?: ResourceDetectionConfig): Promise<Resource> {
    try {
      let containerId = '';
      const isKubernetesEnvironment = this.isInKubernetesEnvironment();
      if (isKubernetesEnvironment) {
        containerId = await this._getContainerIdK8();
      } else {
        containerId = (await this._getContainerId()) || '';
      }
      return !containerId
        ? Resource.empty()
        : new Resource({
          [SEMRESATTRS_CONTAINER_ID]: containerId,
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
    for (const line of splitData) {
      const lastSlashIdx = line.lastIndexOf('/');
      if (lastSlashIdx === -1) {
        continue;
      }
      const lastSection = line.substring(lastSlashIdx + 1);
      const colonIdx = lastSection.lastIndexOf(':');
      if (colonIdx !== -1) {
        // since containerd v1.5.0+, containerId is divided by the last colon when the cgroupDriver is systemd:
        // https://github.com/containerd/containerd/blob/release/1.5/pkg/cri/server/helpers_linux.go#L64
        return lastSection.substring(colonIdx + 1);
      } else {
        let startIdx = lastSection.lastIndexOf('-');
        let endIdx = lastSection.lastIndexOf('.');

        startIdx = startIdx === -1 ? 0 : startIdx + 1;
        if (endIdx === -1) {
          endIdx = lastSection.length;
        }
        if (startIdx > endIdx) {
          continue;
        }
        return lastSection.substring(startIdx, endIdx);
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

  private async getKubernetesApiOptions(path: string): RequestOptions {
    const token = fs.readFileSync(this.K8_TOKEN_PATH, 'utf8');
    const ca = fs.readFileSync(this.K8_CERTIFICATE_PATH, 'utf8');
    return {
      hostname: process.env.KUBERNETES_SERVICE_HOST,
      port: parseInt(process.env.KUBERNETES_SERVICE_PORT_HTTPS || '443', 10),
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      ca: ca,
    };
  }

  async fetchKubernetesApi(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = this.getKubernetesApiOptions(path);
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }


  private isInKubernetesEnvironment(): boolean {
    try {
      fs.accessSync(this.K8_TOKEN_PATH, fs.constants.R_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async _getContainerIdK8() {

    const namespace = fs.readFileSync(this.K8_NAMESPACE_PATH, 'utf8').trim();
    const podName = process.env.POD_NAME;
    const containerName = process.env.CONTAINER_NAME;

    if (podName) {
      const path = `/api/v1/namespaces/${namespace}/pods/${podName}`;
      const podData = await this.fetchKubernetesApi(path);
      const containerStatus = podData.status.containerStatuses.find((status: any) => status.name === containerName);
      if (containerStatus && containerStatus.containerID) {
        return containerStatus.containerID.replace(/^.*:\/\/(.+)$/, '$1');
      } else {
        throw new Error(`Container "${containerName}" not found in pod "${podName}".`);
      }
    } else {
      // If POD_NAME is not provided, loop through all pods
      const path = `/api/v1/namespaces/${namespace}/pods`;
      const podsData = await this.fetchKubernetesApi(path);
      for (const pod of podsData.items) {
        const containerStatus = pod.status.containerStatuses.find((status: any) => status.name === containerName);
        if (containerStatus && containerStatus.containerID) {
          return containerStatus.containerID.replace(/^.*\/([^\/]+)$/, '$1');
        }
      }
      throw new Error(`Container "${containerName}" not found in any pods.`);
    }
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
