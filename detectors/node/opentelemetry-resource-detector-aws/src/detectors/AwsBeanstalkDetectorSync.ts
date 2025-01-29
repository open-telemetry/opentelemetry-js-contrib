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

import { context, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

import {
  DetectorSync,
  IResource,
  Resource,
  ResourceAttributes,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_PLATFORM,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_INSTANCE_ID,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_ELASTIC_BEANSTALK,
} from '../semconv';
import * as fs from 'fs';
import * as util from 'util';

/**
 * The AwsBeanstalkDetector can be used to detect if a process is running in AWS Elastic
 * Beanstalk and return a {@link Resource} populated with data about the beanstalk
 * plugins of AWS X-Ray. Returns an empty Resource if detection fails.
 *
 * See https://docs.amazonaws.cn/en_us/xray/latest/devguide/xray-guide.pdf
 * for more details about detecting information of Elastic Beanstalk plugins
 */

const DEFAULT_BEANSTALK_CONF_PATH =
  '/var/elasticbeanstalk/xray/environment.conf';
const WIN_OS_BEANSTALK_CONF_PATH =
  'C:\\Program Files\\Amazon\\XRay\\environment.conf';

export class AwsBeanstalkDetectorSync implements DetectorSync {
  BEANSTALK_CONF_PATH: string;
  private static readFileAsync = util.promisify(fs.readFile);
  private static fileAccessAsync = util.promisify(fs.access);

  constructor() {
    if (process.platform === 'win32') {
      this.BEANSTALK_CONF_PATH = WIN_OS_BEANSTALK_CONF_PATH;
    } else {
      this.BEANSTALK_CONF_PATH = DEFAULT_BEANSTALK_CONF_PATH;
    }
  }

  detect(config?: ResourceDetectionConfig): IResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return new Resource({}, attributes);
  }

  /**
   * Attempts to obtain AWS Beanstalk configuration from the file
   * system. If file is accesible and read succesfully it returns
   * a promise containing a {@link ResourceAttributes}
   * object with instance metadata. Returns a promise containing an
   * empty {@link ResourceAttributes} if the file is not accesible or
   * fails in the reading process.
   */
  async _getAttributes(
    _config?: ResourceDetectionConfig
  ): Promise<ResourceAttributes> {
    try {
      await AwsBeanstalkDetectorSync.fileAccessAsync(
        this.BEANSTALK_CONF_PATH,
        fs.constants.R_OK
      );

      const rawData = await AwsBeanstalkDetectorSync.readFileAsync(
        this.BEANSTALK_CONF_PATH,
        'utf8'
      );
      const parsedData = JSON.parse(rawData);

      return {
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AWS,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AWS_ELASTIC_BEANSTALK,
        [ATTR_SERVICE_NAME]: CLOUD_PLATFORM_VALUE_AWS_ELASTIC_BEANSTALK,
        [ATTR_SERVICE_NAMESPACE]: parsedData.environment_name,
        [ATTR_SERVICE_VERSION]: parsedData.version_label,
        [ATTR_SERVICE_INSTANCE_ID]: parsedData.deployment_id,
      };
    } catch (e: any) {
      diag.debug(`AwsBeanstalkDetectorSync failed: ${e.message}`);
      return {};
    }
  }
}

export const awsBeanstalkDetectorSync = new AwsBeanstalkDetectorSync();
