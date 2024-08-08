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
  IResource,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';

import { awsBeanstalkDetectorSync } from './AwsBeanstalkDetectorSync';

/**
 * The AwsBeanstalkDetector can be used to detect if a process is running in AWS Elastic
 * Beanstalk and return a {@link Resource} populated with data about the beanstalk
 * plugins of AWS X-Ray. Returns an empty Resource if detection fails.
 *
 * See https://docs.amazonaws.cn/en_us/xray/latest/devguide/xray-guide.pdf
 * for more details about detecting information of Elastic Beanstalk plugins
 *
 * @deprecated Use {@link AwsBeanstalkDetectorSync} class instead.
 */

export class AwsBeanstalkDetector implements Detector {
  detect(config?: ResourceDetectionConfig): Promise<IResource> {
    return Promise.resolve(awsBeanstalkDetectorSync.detect(config));
  }
}

export const awsBeanstalkDetector = new AwsBeanstalkDetector();
