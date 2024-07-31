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
import { alibabaCloudEcsDetectorSync } from './AlibabaCloudEcsDetectorSync';

/**
 * The AlibabaCloudEcsDetector can be used to detect if a process is running in
 * AlibabaCloud ECS and return a {@link Resource} populated with metadata about
 * the ECS instance. Returns an empty Resource if detection fails.
 */
class AlibabaCloudEcsDetector implements Detector {
  /**
   * Detects an AlibabaCloud instance Identity document.
   */
  detect(_config?: ResourceDetectionConfig): Promise<IResource> {
    return Promise.resolve(alibabaCloudEcsDetectorSync.detect(_config));
  }
}

export const alibabaCloudEcsDetector = new AlibabaCloudEcsDetector();
