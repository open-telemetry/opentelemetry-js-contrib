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
  DetectorSync,
  IResource,
  Resource,
  ResourceAttributes,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';
import {
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_REGION,
  ATTR_FAAS_VERSION,
  ATTR_FAAS_NAME,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
} from '../lib/semconv';

/**
 * The AwsLambdaDetector can be used to detect if a process is running in AWS Lambda
 * and return a {@link Resource} populated with data about the environment.
 * Returns an empty Resource if detection fails.
 */
export class AwsLambdaDetectorSync implements DetectorSync {
  detect(_config?: ResourceDetectionConfig): IResource {
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (!functionName) {
      return Resource.empty();
    }

    const functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const region = process.env.AWS_REGION;

    const attributes: ResourceAttributes = {
      [ATTR_CLOUD_PROVIDER]: String(CLOUD_PROVIDER_VALUE_AWS),
      [ATTR_CLOUD_PLATFORM]: String(CLOUD_PLATFORM_VALUE_AWS_LAMBDA),
    };
    if (region) {
      attributes[ATTR_CLOUD_REGION] = region;
    }

    if (functionName) {
      attributes[ATTR_FAAS_NAME] = functionName;
    }
    if (functionVersion) {
      attributes[ATTR_FAAS_VERSION] = functionVersion;
    }

    return new Resource(attributes);
  }
}

export const awsLambdaDetectorSync = new AwsLambdaDetectorSync();
