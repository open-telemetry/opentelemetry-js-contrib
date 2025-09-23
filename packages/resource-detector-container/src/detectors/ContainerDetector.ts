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

import { ResourceDetector, DetectedResource } from '@opentelemetry/resources';

import * as fs from 'fs';
import * as util from 'util';
import { context, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { extractContainerIdFromLine } from './utils';
import { ATTR_CONTAINER_ID } from '../semconv';

export class ContainerDetector implements ResourceDetector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_V1_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';
  readonly HOSTNAME = 'hostname';
  readonly MARKING_PREFIX = ['containers', 'overlay-containers'];
  readonly CRIO = 'crio-';
  readonly CRI_CONTAINERD = 'cri-containerd-';
  readonly DOCKER = 'docker-';
  readonly HEX_STRING_REGEX: RegExp = /^[a-f0-9]+$/i;

  private static readFileAsync = util.promisify(fs.readFile);

  detect(): DetectedResource {
    const attributes = {
      [ATTR_CONTAINER_ID]: this._getContainerIdWithSuppressedTracing(),
    };
    return { attributes };
  }

  private async _getContainerIdWithSuppressedTracing(): Promise<
    string | undefined
  > {
    return context.with(suppressTracing(context.active()), () =>
      this._getContainerId()
    );
  }

  private async _getContainerIdV1(): Promise<string | undefined> {
    const rawData = await ContainerDetector.readFileAsync(
      this.DEFAULT_CGROUP_V1_PATH,
      this.UTF8_UNICODE
    );
    const splitData = rawData.trim().split('\n');

    for (const line of splitData) {
      const containerID = extractContainerIdFromLine(line);
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

    if (!str) return '';

    const strArray = str?.split('/') ?? [];
    for (let i = 0; i < strArray.length - 1; i++) {
      if (
        this.MARKING_PREFIX.includes(strArray[i]) &&
        strArray[i + 1]?.length === this.CONTAINER_ID_LENGTH
      ) {
        return strArray[i + 1];
      }
    }
    return '';
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
        diag.debug(
          'Container Detector failed to read the Container ID: ',
          errorMessage
        );
      }
    }
    return undefined; // Explicitly return undefined if neither ID is found.
  }
}

export const containerDetector = new ContainerDetector();
