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

export class DockerDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_PATH = '/proc/self/cgroup';
  readonly DEFAULT_CGROUP_V2_PATH = '/proc/self/mountinfo';
  readonly UTF8_UNICODE = 'utf8';

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
        'Docker Detector did not identify running inside a supported docker container, no docker attributes will be added to resource: ',
        e
      );
      return Resource.empty();
    }
  }

  private async _getContainerId(): Promise<string | undefined> {
    try {
      let rawData = await DockerDetector.readFileAsync(
        this.DEFAULT_CGROUP_PATH,
        this.UTF8_UNICODE
      );
      let splitData = rawData.trim().split('\n');
      for (const str of splitData) {
        if (str.length >= this.CONTAINER_ID_LENGTH) {
          return str.substring(str.length - this.CONTAINER_ID_LENGTH);
        }
      }

      // If this code is reached - we then check for the V2_PATH
      rawData = await DockerDetector.readFileAsync(
        this.DEFAULT_CGROUP_V2_PATH,
        this.UTF8_UNICODE
      );

      splitData = rawData.trim().split('\n');
      for (let str of splitData) {
        str = str
          .split('/')
          .filter(s => s.length >= this.CONTAINER_ID_LENGTH)[0];
        return str.substring(str.length - this.CONTAINER_ID_LENGTH);
      }
    } catch (e) {
      if (e instanceof Error) {
        const errorMessage = e.message;
        diag.info(
          'Docker Detector failed to read the Container ID: ',
          errorMessage
        );
      }
    }
    return undefined;
  }
}

export const dockerDetector = new DockerDetector();
