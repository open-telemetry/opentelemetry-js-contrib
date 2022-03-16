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

import { AwsInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
registerInstrumentationTesting(new AwsInstrumentation());

import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SpanKind } from '@opentelemetry/api';

import { Lambda, InvocationType } from '@aws-sdk/client-lambda';
import { ClientRequest } from 'http';
import * as nock from 'nock';
import * as expect from 'expect';

process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';
const region = 'us-east-2';

describe('Lambda', () => {
  describe('Invoke', () => {
    describe('Request span attributes', () => {
      const getInvokedSpan = async (params: any) => {
        const lambdaClient = new Lambda({ region });
        nock(`https://lambda.${region}.amazonaws.com/`)
          .post('/2015-03-31/functions/ot-test-function-name/invocations')
          .reply(200, 'null');

        await lambdaClient.invoke(params);
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();
        return span;
      };

      it("should set the span name to the '<function-name> invoke'", async () => {
        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        const span = await getInvokedSpan(params);

        expect(span.name).toEqual(`${params.FunctionName} Invoke`);
      });

      it('should set the span kind to CLIENT', async () => {
        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        const span = await getInvokedSpan(params);

        expect(span.kind).toEqual(SpanKind.CLIENT);
      });

      it('should set the FAAS invoked provider as AWS', async () => {
        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        const span = await getInvokedSpan(params);

        expect(
          span.attributes[SemanticAttributes.FAAS_INVOKED_PROVIDER]
        ).toEqual('aws');
      });

      it('should add the function name as a semantic attribute', async () => {
        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
        };
        const span = await getInvokedSpan(params);

        expect(span.attributes[SemanticAttributes.FAAS_INVOKED_NAME]).toEqual(
          'ot-test-function-name'
        );
      });
    });

    describe('Context propagation', () => {
      it('should propagate client context onto the ClientContext in the invoke payload', async () => {
        const lambdaClient = new Lambda({ region });

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

      it('should skip context propagation in the event it would push the ClientContext over 3583 bytes', async () => {
        const lambdaClient = new Lambda({ region });

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

        const existingClientContext = Buffer.from(
          JSON.stringify({
            Custom: {
              text: [...Array(2600)]
                .map(x => String.fromCharCode(48 + Math.random() * 74))
                .join(''),
            },
          })
        ).toString('base64');

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
          ClientContext: existingClientContext,
        };

        await lambdaClient.invoke(params);

        expect(request).toBeDefined();
        const requestHeaders = request!.headers;
        expect(requestHeaders['x-amz-client-context']).toStrictEqual(
          existingClientContext
        );
      });

      it('should maintain any existing custom fields in the client context', async () => {
        const lambdaClient = new Lambda({ region });

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
          ClientContext: Buffer.from(
            JSON.stringify({
              Custom: {
                existing: 'data',
              },
            })
          ).toString('base64'),
        };

        await lambdaClient.invoke(params);

        expect(request).toBeDefined();
        const requestHeaders = request!.headers;
        const clientContext = JSON.parse(
          Buffer.from(
            requestHeaders['x-amz-client-context'],
            'base64'
          ).toString()
        ) as Record<string, any>;
        expect(clientContext.Custom).toHaveProperty('existing', 'data');
        expect(clientContext.Custom).toHaveProperty('traceparent');
      });

      it('should maintain any existing top-level fields in the client context', async () => {
        const lambdaClient = new Lambda({ region });

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

        const clientContext = {
          env: {
            locale: 'en-US',
            make: 'Nokia',
            model: 'N95',
            platform: 'Symbian',
            platformVersion: '9.2',
          },
          Custom: {
            existing: 'data',
          },
        };
        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
          ClientContext: Buffer.from(JSON.stringify(clientContext)).toString(
            'base64'
          ),
        };

        await lambdaClient.invoke(params);

        expect(request).toBeDefined();
        const requestHeaders = request!.headers;
        const updatedClientContext = JSON.parse(
          Buffer.from(
            requestHeaders['x-amz-client-context'],
            'base64'
          ).toString()
        ) as Record<string, any>;
        expect(updatedClientContext.env).toStrictEqual(clientContext.env);
        expect(updatedClientContext.Custom).toHaveProperty('traceparent');
      });

      // It probably should be valid JSON, and I'm not sure what the lambda internals make of it if
      // it isn't base64 encoded JSON, however there's absolutely nothing stopping an invoker passing
      // absolute garbage in
      it('should abandon context propagation if the existing client context is not valid JSON', async () => {
        const lambdaClient = new Lambda({ region });

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

        const clientContextContent = [...Array(16)]
          .map(x => String.fromCharCode(48 + Math.random() * 74))
          .join('');

        const params = {
          FunctionName: 'ot-test-function-name',
          InvocationType: InvocationType.RequestResponse,
          Payload: Buffer.from(
            JSON.stringify({
              test: 'payload',
            })
          ),
          ClientContext: Buffer.from(clientContextContent).toString('base64'),
        };

        await lambdaClient.invoke(params);

        // Keep whatever was there before
        expect(request).toBeDefined();
        const requestHeaders = request!.headers;
        const clientContext = Buffer.from(
          requestHeaders['x-amz-client-context'],
          'base64'
        ).toString();
        expect(clientContext).toStrictEqual(clientContextContent);

        // We still want span attributes though!
        expect(getTestSpans().length).toBe(1);
        const [span] = getTestSpans();

        expect(span.kind).toEqual(SpanKind.CLIENT);
        expect(span.attributes[SemanticAttributes.FAAS_INVOKED_NAME]).toEqual(
          'ot-test-function-name'
        );
        expect(
          span.attributes[SemanticAttributes.FAAS_INVOKED_PROVIDER]
        ).toEqual('aws');
      });
    });

    it('should add the request ID from the response onto the span', async () => {
      const lambdaClient = new Lambda({ region });

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

      expect(span.attributes[SemanticAttributes.FAAS_EXECUTION]).toEqual(
        '95882c2b-3fd2-485d-ada3-9fcb1ca65459'
      );
    });
  });
});
