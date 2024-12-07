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
} from '@opentelemetry/resources';

/**
 * The AwsLambdaDetector can be used to detect if a process is running in AWS Lambda
 * and return a {@link Resource} populated with data about the environment.
 * Returns an empty Resource if detection fails.
 */
export class AwsLambdaDetectorSync implements DetectorSync {
  detect(): IResource {
    const awsRegion = process.env.AWS_REGION;
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    const functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const logGroupName = process.env.AWS_LAMBDA_LOG_GROUP_NAME;
    const logStreamName = process.env.AWS_LAMBDA_LOG_STREAM_NAME;
    const memorySize = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE as string;

    const attributes: ResourceAttributes = {
      'aws.log.group.names': [logGroupName],
      'cloud.provider': 'aws',
      'cloud.platform': 'aws_lambda',
      'cloud.region': awsRegion,
      'faas.name': functionName,
      'faas.version': functionVersion,
      'faas.instance': logStreamName,
      'faas.max_memory': parseInt(memorySize) * 1024 * 1024,
    };

    return new Resource(attributes);
  }
}

export const awsLambdaDetectorSync = new AwsLambdaDetectorSync();
