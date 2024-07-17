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
import { diag } from '@opentelemetry/api';

export class ContainerDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_V1_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';
  readonly HOSTNAME = 'hostname';
  readonly MARKING_PREFIX = 'containers';
  readonly CRIO = 'crio-';
  readonly CRI_CONTAINERD = 'cri-containerd-';
  readonly DOCKER = 'docker-';
  readonly HEX_STRING_REGEX: RegExp = /^[a-f0-9]+$/i;

  private static readFileAsync = util.promisify(fs.readFile);

  async detect(_config?: ResourceDetectionConfig): Promise<Resource> {
    try {
      const containerId = await this._getContainerId();
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

  private async _getContainerIdV1(): Promise<string | undefined> {
    const rawData = await ContainerDetector.readFileAsync(
      this.DEFAULT_CGROUP_V1_PATH,
      this.UTF8_UNICODE
    );
    const splitData = rawData.trim().split('\n');

    for (const line of splitData) {
      const containerID = this.extractContainerIdFromLine(line);
      if (containerID) {
        return containerID;
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

    const strArray = str?.split('/') ?? [];
    for (let i = 0; i < strArray?.length; i++) {
      if (
        strArray[i] === this.MARKING_PREFIX &&
        strArray[i + 1]?.length === this.CONTAINER_ID_LENGTH
      ) {
        return strArray[i + 1];
      }
    }
    return '';
  }

  private truncatePrefix(lastSection: string, prefix: string): string {
    return lastSection.substring(prefix.length);
  }

  protected extractContainerIdFromLine(line: string): string | null {
    if (line) {
      const sections = line.split('/');
      if (sections.length > 1) {
        let lastSection = sections[sections.length - 1];

        // Handle containerd v1.5.0+ format with systemd cgroup driver
        const colonIndex = lastSection.lastIndexOf(':');
        if (colonIndex !== -1) {
          lastSection = lastSection.substring(colonIndex + 1);
        }

        // Truncate known prefixes from the last section
        if (lastSection.startsWith(this.CRIO)) {
          lastSection = this.truncatePrefix(lastSection, this.CRIO);
        } else if (lastSection.startsWith(this.DOCKER)) {
          lastSection = this.truncatePrefix(lastSection, this.DOCKER);
        } else if (lastSection.startsWith(this.CRI_CONTAINERD)) {
          lastSection = this.truncatePrefix(lastSection, this.CRI_CONTAINERD);
        }
        // Remove anything after the first period
        if (lastSection.includes('.')) {
          lastSection = lastSection.split('.')[0];
        }
        // Check if the remaining string is a valid hex string
        if (this.HEX_STRING_REGEX.test(lastSection)) {
          return lastSection;
        }
      }
    }
    return null;
  }
  /*
    cgroupv1 path would still exist in case of container running on v2
    but the cgroupv1 path would no longer have the container id and would
    fallback on the cgroupv2 implementation.
  */
  private async _getContainerId(): Promise<string | undefined> {
    try {
      const containerIdV1 = await this._getContainerIdV1();
      if (containerIdV1) {
        return containerIdV1; // If containerIdV1 is a non-empty string, return it.
      }
      const containerIdV2 = await this._getContainerIdV2();
      if (containerIdV2) {
        return containerIdV2; // If containerIdV2 is a non-empty string, return it.
      }
    } catch (e) {
      if (e instanceof Error) {
        const errorMessage = e.message;
        diag.info(
          'Container Detector failed to read the Container ID: ',
          errorMessage
        );
      }
    }
    return undefined; // Explicitly return undefined if neither ID is found.
  }
}

export const containerDetector = new ContainerDetector();
