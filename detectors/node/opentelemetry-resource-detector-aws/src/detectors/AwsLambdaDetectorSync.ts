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
  // AWS attributes
  ATTR_AWS_LOG_GROUP_NAMES,
  // Cloud attributes
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_REGION,
  // Cloud values (AWS)
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
} from '../semconv';

/**
 * The AwsLambdaDetector can be used to detect if a process is running in AWS Lambda
 * and return a {@link Resource} populated with data about the environment.
 * Returns an empty Resource if detection fails.
 *
 * AWS Lambda documentation for available environment variables within the Lambda runtimes.
 * @see https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime
 */
export class AwsLambdaDetectorSync implements DetectorSync {
  detect(_config?: ResourceDetectionConfig): IResource {
    // Check if running inside AWS Lambda environment
    const executionEnv = process.env.AWS_EXECUTION_ENV;
    if (!executionEnv?.startsWith('AWS_Lambda_')) {
      return Resource.empty();
    }

    // These environment variables are guaranteed to be present in AWS Lambda
    const region = process.env.AWS_REGION;
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    const functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const memorySize = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

    // These environment variables are not available in Lambda SnapStart
    const logGroupName = process.env.AWS_LAMBDA_LOG_GROUP_NAME;
    const logStreamName = process.env.AWS_LAMBDA_LOG_STREAM_NAME;

    const attributes: ResourceAttributes = {
      [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AWS,
      [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
      [ATTR_CLOUD_REGION]: region,
      [ATTR_FAAS_NAME]: functionName,
      [ATTR_FAAS_VERSION]: functionVersion,
      [ATTR_FAAS_MAX_MEMORY]: parseInt(memorySize!) * 1024 * 1024,
    };

    if (logGroupName) {
      attributes[ATTR_AWS_LOG_GROUP_NAMES] = [logGroupName];
    }
    if (logStreamName) {
      attributes[ATTR_FAAS_INSTANCE] = logStreamName;
    }

    return new Resource(attributes);
  }
}

export const awsLambdaDetectorSync = new AwsLambdaDetectorSync();
