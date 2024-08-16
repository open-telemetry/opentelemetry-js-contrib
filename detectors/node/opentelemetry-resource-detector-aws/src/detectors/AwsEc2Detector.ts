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

import { awsEc2DetectorSync } from './AwsEc2DetectorSync';

/**
 * The AwsEc2Detector can be used to detect if a process is running in AWS EC2
 * and return a {@link Resource} populated with metadata about the EC2
 * instance.
 *
 * @deprecated Use {@link AwsEc2DetectorSync} class instead.
 */
class AwsEc2Detector implements Detector {
  detect(_config?: ResourceDetectionConfig): Promise<IResource> {
    return Promise.resolve(awsEc2DetectorSync.detect(_config));
  }
}

export const awsEc2Detector = new AwsEc2Detector();
