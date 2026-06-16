/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN,
  ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN,
} from '../src/semconv';

import { SFN } from '@aws-sdk/client-sfn';

import { expect } from 'expect';
import * as nock from 'nock';

const region = 'us-east-1';

describe('SFN', () => {
  let sfn: SFN;
  beforeEach(() => {
    sfn = new SFN({
      region: region,
      credentials: {
        accessKeyId: 'abcde',
        secretAccessKey: 'abcde',
      },
    });
  });

  describe('DescribeStateMachine', () => {
    it('span has stateMachineArn in its attributes', async () => {
      const stateMachineArn =
        'arn:aws:states:us-east-1:123456789123:stateMachine:testStateMachine';

      nock(`https://states.${region}.amazonaws.com/`)
        .post('/')
        .reply(200, '{}');

      await sfn.describeStateMachine({
        stateMachineArn: stateMachineArn,
      });

      const testSpans: ReadableSpan[] = getTestSpans();
      const getStateMachineAttributeSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'SFN.DescribeStateMachine';
        }
      );

      expect(getStateMachineAttributeSpans.length).toBe(1);

      const stateMachineAttributeSpan = getStateMachineAttributeSpans[0];
      expect(
        ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN in
          stateMachineAttributeSpan.attributes
      );
      expect(
        stateMachineAttributeSpan.attributes[
          ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN
        ]
      ).toBe(stateMachineArn);
      expect(stateMachineAttributeSpan.kind).toBe(SpanKind.CLIENT);
    });
  });

  describe('DescribeActivity', () => {
    it('span has activityArn in its attributes', async () => {
      const activityArn =
        'arn:aws:states:us-east-1:123456789123:activity:testActivity';

      nock(`https://states.${region}.amazonaws.com/`)
        .post('/')
        .reply(200, '{}');

      await sfn.describeActivity({
        activityArn: activityArn,
      });

      const testSpans: ReadableSpan[] = getTestSpans();
      const getActivityAttributeSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'SFN.DescribeActivity';
        }
      );

      expect(getActivityAttributeSpans.length).toBe(1);

      const activityAttributeSpan = getActivityAttributeSpans[0];
      expect(
        ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN in activityAttributeSpan.attributes
      );
      expect(
        activityAttributeSpan.attributes[ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN]
      ).toBe(activityArn);
      expect(activityAttributeSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
