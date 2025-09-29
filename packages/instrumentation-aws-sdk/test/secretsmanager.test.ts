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

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ATTR_AWS_SECRETSMANAGER_SECRET_ARN } from '../src/semconv';

import { SecretsManager } from '@aws-sdk/client-secrets-manager';

import { expect } from 'expect';
import * as nock from 'nock';

const region = 'us-east-1';

describe('SecretsManager', () => {
  let secretsManager: SecretsManager;
  beforeEach(() => {
    secretsManager = new SecretsManager({
      region: region,
      credentials: {
        accessKeyId: 'abcde',
        secretAccessKey: 'abcde',
      },
    });
  });

  describe('DescribeSecret', () => {
    const testParams = [
      'testId',
      'badarn:aws:secretsmanager:us-weast-1:123456789123:secret:testId123456',
      'arn:aws:secretsmanager:us-east-1:123456789123:secret:testId123456',
    ];

    testParams.forEach(secretId => {
      it('should generate secret arn attribute only if secretId is an valid ARN', async () => {
        nock(`https://secretsmanager.${region}.amazonaws.com/`)
          .post('/')
          .reply(200, '{}');

        await secretsManager.describeSecret({
          SecretId: secretId,
        });

        const testSpans: ReadableSpan[] = getTestSpans();
        const getDescribeSecretSpans: ReadableSpan[] = testSpans.filter(
          (s: ReadableSpan) => {
            return s.name === 'SecretsManager.DescribeSecret';
          }
        );

        expect(getDescribeSecretSpans.length).toBe(1);
        const describeSecretSpan = getDescribeSecretSpans[0];

        if (secretId.startsWith('arn:aws:secretsmanager:')) {
          expect(
            describeSecretSpan.attributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN]
          ).toBe(secretId);
        } else {
          expect(
            describeSecretSpan.attributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN]
          ).toBeUndefined();
        }

        expect(describeSecretSpan.kind).toBe(SpanKind.CLIENT);
      });
    });
  });

  describe('GetSecretValue', () => {
    it('secret arn attribute should be populated from the response', async () => {
      const secretIdArn =
        'arn:aws:secretsmanager:us-east-1:123456789123:secret:testId123456';

      nock(`https://secretsmanager.${region}.amazonaws.com/`)
        .post('/')
        .reply(200, {
          ARN: secretIdArn,
          Name: 'testId',
        });

      await secretsManager.getSecretValue({
        SecretId: 'testSecret',
      });

      const testSpans: ReadableSpan[] = getTestSpans();
      const getSecretValueSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'SecretsManager.GetSecretValue';
        }
      );

      expect(getSecretValueSpans.length).toBe(1);

      const secretValueSpan = getSecretValueSpans[0];
      expect(
        secretValueSpan.attributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN]
      ).toBe(secretIdArn);
      expect(secretValueSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
