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

export class ContainerDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_V1_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';
  readonly HOSTNAME = 'hostname';

  private static readFileAsync = util.promisify(fs.readFile);

  async detect(_config?: ResourceDetectionConfig): Promise<Resource> {
    try {
      const containerId = await this._getContainerId();
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
