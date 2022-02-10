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
  AwsInstrumentation,
  AwsSdkRequestHookInformation,
  AwsSdkResponseHookInformation,
} from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(
  new AwsInstrumentation()
);
import {
  PutObjectCommand,
  PutObjectCommandOutput,
  S3,
  S3Client,
} from '@aws-sdk/client-s3';
import { SQS } from '@aws-sdk/client-sqs';
import { Lambda, InvocationType } from '@aws-sdk/client-lambda';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

import 'mocha';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  context,
  SpanStatusCode,
  trace,
  Span,
  SpanKind,
} from '@opentelemetry/api';
import {
  MessagingDestinationKindValues,
  MessagingOperationValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import { AttributeNames } from '../src/enums';
import {
  LambdaTestCustomServiceExtension,
  SqsTestCustomServiceExtension,
} from './test-custom-extensions';
import { ClientRequest } from 'http';
import * as expect from 'expect';
import * as fs from 'fs';
import * as nock from 'nock';

const region = 'us-east-1';

describe('instrumentation-aws-sdk-v3', () => {
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
      expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
        'PutObject'
      );
      expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('S3');
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
      expect(span.name).toEqual('S3.PutObject');
      expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(200);
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
        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'PutObject'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('S3');
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
        expect(span.name).toEqual('S3.PutObject');
        expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(
          200
        );
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
      expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
        'PutObject'
      );
      expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('S3');
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
      expect(span.name).toEqual('S3.PutObject');
      expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(200);
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

        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'PutObject'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('S3');
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

    describe('custom services extensions', () => {
      it('should use any provided custom extensions requestPreSpanHook to add span attributes', async () => {
        const lambdaClient = new Lambda({ region });
        instrumentation.disable();
        instrumentation.setConfig({
          suppressInternalInstrumentation: true,
          customServiceExtensions: [
            {
              serviceName: 'Lambda',
              extension: new LambdaTestCustomServiceExtension(),
            },
          ],
        });
        instrumentation.enable();

        nock(`https://lambda.${region}.amazonaws.com/`)
          .post('/2015-03-31/functions/ot-test-function-name/invocations')
          .reply(200, 'null');

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        await lambdaClient.invoke(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'Invoke'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
          'Lambda'
        );
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

        // custom messaging attributes
        expect(span.kind).toEqual(SpanKind.CLIENT);
        expect(span.attributes[SemanticAttributes.FAAS_INVOKED_NAME]).toEqual(
          'ot-test-function-name'
        );
        expect(
          span.attributes[SemanticAttributes.FAAS_INVOKED_PROVIDER]
        ).toEqual('aws');
      });

      it('should use any provided custom extensions requestPostSpanHook to add propagation context', async () => {
        const lambdaClient = new Lambda({ region });
        instrumentation.disable();
        instrumentation.setConfig({
          suppressInternalInstrumentation: true,
          customServiceExtensions: [
            {
              serviceName: 'Lambda',
              extension: new LambdaTestCustomServiceExtension(),
            },
          ],
        });
        instrumentation.enable();

        let request:
          | (ClientRequest & {
              headers: Record<string, string>;
            })
          | undefined;
        nock(`https://lambda.${region}.amazonaws.com/`)
          .post('/2015-03-31/functions/ot-test-function-name/invocations')
          .reply(function (uri, requestBody, callback) {
            request = this.req;
            callback(null, [200, 'null']);
          });

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        await lambdaClient.invoke(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'Invoke'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
          'Lambda'
        );
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

        // Context propagation
        expect(request).toBeDefined();
        const requestHeaders = request!.headers;
        expect(requestHeaders['x-amz-client-context']).toBeDefined();
        const clientContext = JSON.parse(
          Buffer.from(
            requestHeaders['x-amz-client-context'],
            'base64'
          ).toString()
        ) as Record<string, any>;
        expect(clientContext.Custom).toHaveProperty('traceparent');
      });

      it('should use any provided custom extensions responseHook to add any span attributes from the API response', async () => {
        const lambdaClient = new Lambda({ region });
        instrumentation.disable();
        instrumentation.setConfig({
          suppressInternalInstrumentation: true,
          customServiceExtensions: [
            {
              serviceName: 'Lambda',
              extension: new LambdaTestCustomServiceExtension(),
            },
          ],
        });
        instrumentation.enable();

        nock(`https://lambda.${region}.amazonaws.com/`)
          .post('/2015-03-31/functions/ot-test-function-name/invocations')
          .reply((uri, requestBody, callback) => {
            callback(null, [
              200,
              'null',
              {
                'x-amz-executed-version': '$LATEST',
                'x-amzn-requestid': '95882c2b-3fd2-485d-ada3-9fcb1ca65459',
              },
            ]);
          });

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        await lambdaClient.invoke(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'Invoke'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
          'Lambda'
        );
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

        // Response attributes
        expect(span.attributes[SemanticAttributes.FAAS_EXECUTION]).toEqual(
          '95882c2b-3fd2-485d-ada3-9fcb1ca65459'
        );
      });

      it('should default to the basic SDK instrumentation if the config is overridden', async () => {
        const lambdaClient = new Lambda({ region });
        instrumentation.disable();
        instrumentation.setConfig({
          suppressInternalInstrumentation: true,
        });
        instrumentation.enable();

        nock(`https://lambda.${region}.amazonaws.com/`)
          .post('/2015-03-31/functions/ot-test-function-name/invocations')
          .reply(200, 'null');

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        await lambdaClient.invoke(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'Invoke'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
          'Lambda'
        );
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

        // custom messaging attributes should be absent as we've reverted to just adding what the
        // default AWS SDK instrumentation understands
        expect(span.kind).toEqual(SpanKind.INTERNAL);
        expect(span.attributes).not.toHaveProperty(
          SemanticAttributes.FAAS_INVOKED_NAME
        );
        expect(span.attributes).not.toHaveProperty(
          SemanticAttributes.FAAS_INVOKED_PROVIDER
        );
      });

      it('should override a built-in service extension if a custom service extension is provided for the same service', async () => {
        const sqsClient = new SQS({ region });
        instrumentation.disable();
        instrumentation.setConfig({
          suppressInternalInstrumentation: true,
          customServiceExtensions: [
            {
              serviceName: 'SQS',
              extension: new SqsTestCustomServiceExtension(),
            },
          ],
        });
        instrumentation.enable();

        nock(`https://sqs.${region}.amazonaws.com/`)
          .post('/')
          .reply(
            200,
            fs.readFileSync('./test/mock-responses/sqs-send.xml', 'utf8')
          );

        const params = {
          QueueUrl:
            'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
          MessageBody: 'payload example from v3 without batch',
        };
        await sqsClient.sendMessage(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        // Ensure the span name set by the custom instrumentation is there
        expect(span.name).toEqual('custom SQS span');
      });
    });
  });

  describe('custom service behavior', () => {
    describe('SQS', () => {
      const sqsClient = new SQS({ region });

      it('sqs send add messaging attributes', async () => {
        nock(`https://sqs.${region}.amazonaws.com/`)
          .post('/')
          .reply(
            200,
            fs.readFileSync('./test/mock-responses/sqs-send.xml', 'utf8')
          );

        const params = {
          QueueUrl:
            'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
          MessageBody: 'payload example from v3 without batch',
        };
        await sqsClient.sendMessage(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        // make sure we have the general aws attributes:
        expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
          'aws-api'
        );
        expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
          'SendMessage'
        );
        expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('SQS');
        expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

        // custom messaging attributes
        expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual(
          'aws.sqs'
        );
        expect(
          span.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]
        ).toEqual(MessagingDestinationKindValues.QUEUE);
        expect(
          span.attributes[SemanticAttributes.MESSAGING_DESTINATION]
        ).toEqual('otel-demo-aws-sdk');
        expect(span.attributes[SemanticAttributes.MESSAGING_URL]).toEqual(
          params.QueueUrl
        );
        expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(
          200
        );
      });

      it('sqs receive add messaging attributes and context', done => {
        nock(`https://sqs.${region}.amazonaws.com/`)
          .post('/')
          .reply(
            200,
            fs.readFileSync('./test/mock-responses/sqs-receive.xml', 'utf8')
          );

        const params = {
          QueueUrl:
            'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
          MaxNumberOfMessages: 3,
        };
        sqsClient.receiveMessage(params).then(res => {
          expect(getTestSpans().length).toBe(1);
          const [span] = getTestSpans();

          // make sure we have the general aws attributes:
          expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual(
            'aws-api'
          );
          expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
            'ReceiveMessage'
          );
          expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
            'SQS'
          );
          expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

          const receiveCallbackSpan = trace.getSpan(context.active());
          expect(receiveCallbackSpan).toBeDefined();
          const attributes = (receiveCallbackSpan as unknown as ReadableSpan)
            .attributes;
          expect(attributes[SemanticAttributes.MESSAGING_OPERATION]).toMatch(
            MessagingOperationValues.RECEIVE
          );
          expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(
            200
          );
          done();
        });
      });
    });
  });
});
