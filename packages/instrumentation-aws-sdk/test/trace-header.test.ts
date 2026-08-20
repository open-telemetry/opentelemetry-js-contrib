/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';

import { S3 } from '@aws-sdk/client-s3';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

import 'mocha';
import { expect } from 'expect';
import * as fs from 'fs';
import * as nock from 'nock';
import { carriedTraceHeaderFields } from '../src/trace-header';

const region = 'us-east-1';

/** Uploads an object and hands back the tracing header the request went out with. */
const traceHeaderSentBy = async (s3: S3): Promise<string | undefined> => {
  let sent: string | undefined;
  nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
    .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
    .reply(function () {
      sent = this.req.headers['x-amzn-trace-id'] as string | undefined;
      return [
        200,
        fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8'),
      ];
    });

  await s3.putObject({
    Bucket: 'ot-demo-test',
    Key: 'aws-ot-s3-test-object.txt',
  });
  return sent;
};

describe('instrumentation-aws-sdk trace header', () => {
  const previousTraceId = process.env._X_AMZN_TRACE_ID;

  beforeEach(() => {
    instrumentation.setConfig({});
    delete process.env._X_AMZN_TRACE_ID;
  });

  after(() => {
    if (previousTraceId === undefined) {
      delete process.env._X_AMZN_TRACE_ID;
    } else {
      process.env._X_AMZN_TRACE_ID = previousTraceId;
    }
    instrumentation.setConfig({});
  });

  describe('carriedTraceHeaderFields', () => {
    it('keeps the platform fields and drops the trace fields', () => {
      expect(
        carriedTraceHeaderFields(
          'Root=1-11111111-111111111111111111111111;Parent=2222222222222222;Sampled=0;Lineage=2:a87bd80c:1;Self=1-67891233-12456789abcdef012345678'
        )
      ).toEqual([
        'Lineage=2:a87bd80c:1',
        'Self=1-67891233-12456789abcdef012345678',
      ]);
    });

    it('carries an unrecognised field rather than guess at it', () => {
      expect(carriedTraceHeaderFields('Root=1-a-b;CalledFrom=app')).toEqual([
        'CalledFrom=app',
      ]);
    });

    it('finds nothing in an absent or empty header', () => {
      expect(carriedTraceHeaderFields(undefined)).toEqual([]);
      expect(carriedTraceHeaderFields('')).toEqual([]);
    });
  });

  describe('on an outgoing request', () => {
    it('sets the tracing header from the active span', async () => {
      const sent = await traceHeaderSentBy(new S3({ region }));

      expect(sent).toMatch(/^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=[01]$/);
    });

    // Lambda counts the hops of one triggering event in Lineage and stops
    // invoking a function after roughly sixteen. Replacing the header without
    // carrying it forward restarts the count on every hop, which silently
    // disables recursive loop detection through Lambda, S3, SQS and SNS.
    it('carries Lineage from the invocation onto the header', async () => {
      process.env._X_AMZN_TRACE_ID =
        'Root=1-11111111-111111111111111111111111;Sampled=0;Lineage=2:a87bd80c:1';

      const sent = await traceHeaderSentBy(new S3({ region }));

      expect(sent).toContain(';Lineage=2:a87bd80c:1');
      expect(sent).not.toContain('Root=1-11111111');
    });

    it('carries Self and unrecognised fields too', async () => {
      process.env._X_AMZN_TRACE_ID =
        'Root=1-11111111-111111111111111111111111;Self=1-67891233-12456789abcdef012345678;CalledFrom=app';

      const sent = await traceHeaderSentBy(new S3({ region }));

      expect(sent).toContain(';Self=1-67891233-12456789abcdef012345678');
      expect(sent).toContain(';CalledFrom=app');
    });

    it('leaves the header to the AWS SDK when disabled', async () => {
      instrumentation.setConfig({ injectTraceHeader: false });
      process.env._X_AMZN_TRACE_ID =
        'Root=1-11111111-111111111111111111111111;Sampled=0;Lineage=2:a87bd80c:1';

      const sent = await traceHeaderSentBy(new S3({ region }));

      // Nothing sets it: this instrumentation is off, and the SDK's own
      // recursion-detection middleware only acts inside Lambda, where
      // AWS_LAMBDA_FUNCTION_NAME is set.
      expect(sent).toBeUndefined();
    });
  });
});
