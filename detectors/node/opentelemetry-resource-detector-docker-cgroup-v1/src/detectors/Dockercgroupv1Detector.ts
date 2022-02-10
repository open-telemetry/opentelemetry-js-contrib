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

export class DockercgroupDetector implements Detector {
  readonly CONTAINER_ID_LENGTH = 64;
  readonly DEFAULT_CGROUP_PATH = '/proc/self/cgroup';
  readonly TIMEOUT_MS = 2000;
  readonly UTF8_UNICODE = 'utf8';

  private static readFileAsync = util.promisify(fs.readFile);
  private static fileAccessAsync = util.promisify(fs.access);

  async detect(_config?: ResourceDetectionConfig): Promise<Resource> {
    try {
      if (!(await this._isSupportedDocker())) {
        return Resource.empty();
      }

      const containerId = await this._getContainerId();

      return !containerId
        ? Resource.empty()
        : new Resource({
            [SemanticResourceAttributes.CONTAINER_ID]: containerId || '',
          });
    } catch (e) {
      diag.warn('Process is not running on a supported docker version', e);
      return Resource.empty();
    }
  }

  private async _getContainerId(): Promise<string | undefined> {
    try {
      const rawData = await DockercgroupDetector.readFileAsync(
        this.DEFAULT_CGROUP_PATH,
        this.UTF8_UNICODE
      );
      const splitData = rawData.trim().split('\n');
      for (const str of splitData) {
        if (str.length >= this.CONTAINER_ID_LENGTH) {
          return str.substring(str.length - this.CONTAINER_ID_LENGTH);
        }
      }
    } catch (e) {
      let errorMessage = '';
      if (e instanceof Error) {
        errorMessage = e.message;
        diag.warn(
          `Docker CGROUP Detector failed to read container ID: ${errorMessage}`
        );
      }
    }
    return undefined;
  }

  private async _isSupportedDocker(): Promise<boolean | false> {
    try {
      await DockercgroupDetector.fileAccessAsync(this.DEFAULT_CGROUP_PATH);
      return true;
    } catch (e) {
      diag.error(`cannot access ${this.DEFAULT_CGROUP_PATH} folder ${e}`);
      return false;
    }
  }
}

export const dockercgroupDetector = new DockercgroupDetector();
