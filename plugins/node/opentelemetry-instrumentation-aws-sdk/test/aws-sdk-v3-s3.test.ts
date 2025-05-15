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
  AwsSdkRequestHookInformation,
  AwsSdkResponseHookInformation,
} from '../src';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { instrumentation } from './load-instrumentation';

import {
  PutObjectCommand,
  PutObjectCommandOutput,
  S3,
  S3Client,
} from '@aws-sdk/client-s3';
import { SpanKind } from '@opentelemetry/api';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

import 'mocha';
import { SpanStatusCode, Span } from '@opentelemetry/api';
import {
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_RPC_METHOD,
  SEMATTRS_RPC_SERVICE,
  SEMATTRS_RPC_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import { AttributeNames } from '../src/enums';
import { expect } from 'expect';
import * as fs from 'fs';
import * as nock from 'nock';

const region = 'us-east-1';

describe('instrumentation-aws-sdk-v3 (client-s3)', () => {
  const s3Client = new S3({ region });

  describe('functional', () => {
    it('promise await', async () => {
      nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
        );

      const params = {
        Bucket: 'ot-demo-test',
        Key: 'aws-ot-s3-test-object.txt',
      };
      await s3Client.putObject(params);
      expect(getTestSpans().length).toBe(1);
      const [span] = getTestSpans();
      expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('PutObject');
      expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('S3');
      expect(span.attributes[AttributeNames.AWS_S3_BUCKET]).toEqual(
        'ot-demo-test'
      );
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
      expect(span.name).toEqual('S3.PutObject');
      expect(span.kind).toEqual(SpanKind.CLIENT);
      expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
    });

    it('callback interface', done => {
      nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
        );

      const params = {
        Bucket: 'ot-demo-test',
        Key: 'aws-ot-s3-test-object.txt',
      };
      s3Client.putObject(params, (err: any, data?: PutObjectCommandOutput) => {
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();
        expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
        expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('PutObject');
        expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('S3');
        expect(span.attributes[AttributeNames.AWS_S3_BUCKET]).toEqual(
          'ot-demo-test'
        );
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
        expect(span.name).toEqual('S3.PutObject');
        expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
        done();
      });
    });

    it('use the sdk client style to perform operation', async () => {
      nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
        );

      const params = {
        Bucket: 'ot-demo-test',
        Key: 'aws-ot-s3-test-object.txt',
      };
      const client = new S3Client({ region });
      await client.send(new PutObjectCommand(params));
      expect(getTestSpans().length).toBe(1);
      const [span] = getTestSpans();
      expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('PutObject');
      expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('S3');
      expect(span.attributes[AttributeNames.AWS_S3_BUCKET]).toEqual(
        'ot-demo-test'
      );
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
      expect(span.name).toEqual('S3.PutObject');
      expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
    });

    it('aws error', async () => {
      nock(`https://invalid-bucket-name.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          403,
          fs.readFileSync('./test/mock-responses/invalid-bucket.xml', 'utf8')
        );

      const params = {
        Bucket: 'invalid-bucket-name',
        Key: 'aws-ot-s3-test-object.txt',
      };

      try {
        await s3Client.putObject(params);
      } catch {
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        // expect error attributes
        expect(span.status.code).toEqual(SpanStatusCode.ERROR);
        expect(span.status.message).toEqual('Access Denied');
        expect(span.events.length).toBe(1);
        expect(span.events[0].name).toEqual('exception');

        expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
        expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('PutObject');
        expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('S3');
        expect(span.attributes[AttributeNames.AWS_S3_BUCKET]).toEqual(
          'invalid-bucket-name'
        );
        expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(403);
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
        expect(span.attributes[AttributeNames.AWS_REQUEST_ID]).toEqual(
          'MS95GTS7KXQ34X2S'
        );
        expect(span.name).toEqual('S3.PutObject');
      }
    });
  });

  describe('instrumentation config', () => {
    describe('hooks', () => {
      it('verify request and response hooks are called with right params', async () => {
        instrumentation.disable();
        instrumentation.setConfig({
          preRequestHook: (
            span: Span,
            requestInfo: AwsSdkRequestHookInformation
          ) => {
            span.setAttribute(
              'attribute.from.request.hook',
              requestInfo.request.commandInput.Bucket
            );
          },

          responseHook: (
            span: Span,
            responseInfo: AwsSdkResponseHookInformation
          ) => {
            span.setAttribute(
              'attribute.from.response.hook',
              'data from response hook'
            );
          },

          suppressInternalInstrumentation: true,
        });
        instrumentation.enable();

        nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
          .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
          .reply(
            200,
            fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
          );

        const params = {
          Bucket: 'ot-demo-test',
          Key: 'aws-ot-s3-test-object.txt',
        };
        await s3Client.putObject(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();
        expect(span.attributes['attribute.from.request.hook']).toEqual(
          params.Bucket
        );
        expect(span.attributes['attribute.from.response.hook']).toEqual(
          'data from response hook'
        );
      });

      it('handle throw in request and response hooks', async () => {
        instrumentation.disable();
        instrumentation.setConfig({
          preRequestHook: (
            span: Span,
            requestInfo: AwsSdkRequestHookInformation
          ) => {
            span.setAttribute(
              'attribute.from.request.hook',
              requestInfo.request.commandInput.Bucket
            );
            throw new Error('error from request hook in unittests');
          },

          responseHook: (
            span: Span,
            responseInfo: AwsSdkResponseHookInformation
          ) => {
            throw new Error('error from response hook in unittests');
          },

          suppressInternalInstrumentation: true,
        });
        instrumentation.enable();

        nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
          .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
          .reply(
            200,
            fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
          );

        const params = {
          Bucket: 'ot-demo-test',
          Key: 'aws-ot-s3-test-object.txt',
        };
        await s3Client.putObject(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();
        expect(span.attributes['attribute.from.request.hook']).toEqual(
          params.Bucket
        );
      });
    });
  });
});
