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

import * as assert from 'assert';
import { detectResources } from '@opentelemetry/resources';
import { assertEmptyResource } from '@opentelemetry/contrib-test-utils';
import { awsLambdaDetector } from '../../src';
import {
  ATTR_AWS_LOG_GROUP_NAMES,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_FAAS_INSTANCE,
  ATTR_FAAS_NAME,
  ATTR_FAAS_MAX_MEMORY,
  ATTR_FAAS_VERSION,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
} from '../../src/semconv';

describe('awsLambdaDetector', () => {
  let oldEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    oldEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  describe('on lambda', () => {
    it('fills resource', async () => {
      process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'name';
      process.env.AWS_LAMBDA_FUNCTION_VERSION = 'v1';
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '128';
      process.env.AWS_LAMBDA_LOG_GROUP_NAME = '/aws/lambda/name';
      process.env.AWS_LAMBDA_LOG_STREAM_NAME = '2024/03/14/[$LATEST]123456';

      const resource = detectResources({ detectors: [awsLambdaDetector] });

      assert.strictEqual(
        resource.attributes[ATTR_CLOUD_PROVIDER],
        CLOUD_PROVIDER_VALUE_AWS
      );
      assert.strictEqual(
        resource.attributes[ATTR_CLOUD_PLATFORM],
        CLOUD_PLATFORM_VALUE_AWS_LAMBDA
      );
      assert.strictEqual(resource.attributes[ATTR_CLOUD_REGION], 'us-east-1');
      assert.strictEqual(resource.attributes[ATTR_FAAS_NAME], 'name');
      assert.strictEqual(resource.attributes[ATTR_FAAS_VERSION], 'v1');
      assert.strictEqual(
        resource.attributes[ATTR_FAAS_INSTANCE],
        '2024/03/14/[$LATEST]123456'
      );
      assert.strictEqual(
        resource.attributes[ATTR_FAAS_MAX_MEMORY],
        128 * 1024 * 1024
      );
      assert.deepStrictEqual(resource.attributes[ATTR_AWS_LOG_GROUP_NAMES], [
        '/aws/lambda/name',
      ]);
    });
  });

  describe('not on lambda', () => {
    it('returns empty resource if AWS_EXECUTION_ENV is not set', async () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'name';
      process.env.AWS_REGION = 'us-east-1';

      const resource = detectResources({ detectors: [awsLambdaDetector] });

      assertEmptyResource(resource);
    });

    it('returns empty resource if AWS_EXECUTION_ENV is not Lambda', async () => {
      process.env.AWS_EXECUTION_ENV = 'AWS_ECS_EC2';
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'name';
      process.env.AWS_REGION = 'us-east-1';

      const resource = detectResources({ detectors: [awsLambdaDetector] });

      assertEmptyResource(resource);
    });
  });
});
