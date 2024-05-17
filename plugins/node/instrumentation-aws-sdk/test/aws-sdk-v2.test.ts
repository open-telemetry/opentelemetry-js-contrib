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
import * as AWS from 'aws-sdk';

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode, Span, SpanKind } from '@opentelemetry/api';
import { AttributeNames } from '../src/enums';
import { mockV2AwsSend } from './testing-utils';
import { expect } from 'expect';
import { SEMATTRS_HTTP_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import { AWSError } from 'aws-sdk';
import { HttpResponse } from 'aws-sdk/lib/http_response';

describe('instrumentation-aws-sdk-v2', () => {
  const responseMockSuccess = {
    requestId: '0000000000000',
    error: null,
    httpResponse: {
      statusCode: 200,
    },
  };

  const error: AWSError = {
    name: 'error',
    message: 'something went wrong',
    stack: 'fakeStack',
    code: 'errorCode',
    time: new Date(),
  };

  const responseMockWithError: Pick<
    AWS.Response<any, AWSError>,
    'requestId' | 'error'
  > & { httpResponse: Partial<HttpResponse> } = {
    requestId: '0000000000000',
    error,
    httpResponse: {
      statusCode: 400,
    },
  };

  const getAwsSpans = (): ReadableSpan[] => {
    return getTestSpans().filter(s =>
      s.instrumentationLibrary.name.includes('aws-sdk')
    );
  };

  before(() => {
    AWS.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  describe('functional', () => {
    describe('successful send', () => {
      before(() => {
        mockV2AwsSend(responseMockSuccess);
      });

      it('adds proper number of spans with correct attributes', async () => {
        const s3 = new AWS.S3();
        const bucketName = 'aws-test-bucket';
        const keyName = 'aws-test-object.txt';
        await new Promise(resolve => {
          // span 1
          s3.createBucket({ Bucket: bucketName }, async (err, data) => {
            const params = {
              Bucket: bucketName,
              Key: keyName,
              Body: 'Hello World!',
            };
            // span 2
            s3.putObject(params, (err, data) => {
              if (err) console.log(err);
              resolve({});
            });
          });
        });

        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(2);
        const [spanCreateBucket, spanPutObject] = awsSpans;

        expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'createBucket'
        );
        expect(
          spanCreateBucket.attributes[AttributeNames.AWS_SIGNATURE_VERSION]
        ).toBe('s3');
        expect(
          spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_API]
        ).toBe('S3');
        expect(
          spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]
        ).toBe('s3');
        expect(
          spanCreateBucket.attributes[AttributeNames.AWS_SERVICE_NAME]
        ).toBe('Amazon S3');
        expect(spanCreateBucket.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(
          responseMockSuccess.requestId
        );
        expect(spanCreateBucket.attributes[AttributeNames.AWS_REGION]).toBe(
          'us-east-1'
        );
        expect(spanCreateBucket.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(
          200
        );

        expect(spanCreateBucket.name).toBe('S3.CreateBucket');
        expect(spanCreateBucket.kind).toEqual(SpanKind.CLIENT);
        expect(spanPutObject.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'putObject'
        );
        expect(
          spanPutObject.attributes[AttributeNames.AWS_SIGNATURE_VERSION]
        ).toBe('s3');
        expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_API]).toBe(
          'S3'
        );
        expect(
          spanPutObject.attributes[AttributeNames.AWS_SERVICE_IDENTIFIER]
        ).toBe('s3');
        expect(spanPutObject.attributes[AttributeNames.AWS_SERVICE_NAME]).toBe(
          'Amazon S3'
        );
        expect(spanPutObject.attributes[AttributeNames.AWS_REQUEST_ID]).toBe(
          responseMockSuccess.requestId
        );
        expect(spanPutObject.attributes[AttributeNames.AWS_REGION]).toBe(
          'us-east-1'
        );
        expect(spanPutObject.name).toBe('S3.PutObject');
        expect(spanPutObject.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
      });

      it('adds proper number of spans with correct attributes if both, promise and callback were used', async () => {
        const s3 = new AWS.S3();
        const bucketName = 'aws-test-bucket';
        const keyName = 'aws-test-object.txt';
        await new Promise(resolve => {
          // span 1
          s3.createBucket({ Bucket: bucketName }, async (err, data) => {
            const params = {
              Bucket: bucketName,
              Key: keyName,
              Body: 'Hello World!',
            };

            let reqPromise: Promise<any> | null = null;
            let numberOfCalls = 0;
            const cbPromise = new Promise(resolveCb => {
              // span 2
              const request = s3.putObject(params, (err, data) => {
                if (err) console.log(err);
                numberOfCalls++;
                if (numberOfCalls === 2) {
                  resolveCb({});
                }
              });
              // NO span
              reqPromise = request.promise();
            });

            await Promise.all([cbPromise, reqPromise]).then(() => {
              resolve({});
            });
          });
        });

        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(2);
        const [spanCreateBucket, spanPutObjectCb] = awsSpans;
        expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'createBucket'
        );
        expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'putObject'
        );
        expect(spanPutObjectCb.attributes[AttributeNames.AWS_REGION]).toBe(
          'us-east-1'
        );
        expect(spanPutObjectCb.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
      });

      it('adds proper number of spans with correct attributes if only promise was used', async () => {
        const s3 = new AWS.S3();
        const bucketName = 'aws-test-bucket';
        const keyName = 'aws-test-object.txt';
        await new Promise(resolve => {
          // span 1
          s3.createBucket({ Bucket: bucketName }, async (err, data) => {
            const params = {
              Bucket: bucketName,
              Key: keyName,
              Body: 'Hello World!',
            };

            // NO span
            const request = s3.putObject(params);
            // span 2
            await request.promise();
            resolve({});
          });
        });

        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(2);
        const [spanCreateBucket, spanPutObjectCb] = awsSpans;
        expect(spanCreateBucket.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'createBucket'
        );
        expect(spanPutObjectCb.attributes[AttributeNames.AWS_OPERATION]).toBe(
          'putObject'
        );
        expect(spanPutObjectCb.attributes[AttributeNames.AWS_REGION]).toBe(
          'us-east-1'
        );
        expect(spanPutObjectCb.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(200);
      });

      it('should create span if no callback is supplied', done => {
        const s3 = new AWS.S3();
        const bucketName = 'aws-test-bucket';

        s3.putObject({
          Bucket: bucketName,
          Key: 'key name from tests',
          Body: 'Hello World!',
        }).send();

        setImmediate(() => {
          const awsSpans = getAwsSpans();
          expect(awsSpans.length).toBe(1);
          done();
        });
      });
    });

    describe('send return error', () => {
      before(() => {
        mockV2AwsSend(responseMockWithError);
      });

      it('adds error attribute properly', async () => {
        const s3 = new AWS.S3();
        const bucketName = 'aws-test-bucket';
        await new Promise(resolve => {
          s3.createBucket({ Bucket: bucketName }, async () => {
            resolve({});
          });
        });

        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        const [spanCreateBucket] = awsSpans;
        const exceptionEvent = spanCreateBucket.events.filter(
          event => event.name === 'exception'
        );
        expect(exceptionEvent.length).toBe(1);

        expect(exceptionEvent[0]).toStrictEqual(
          expect.objectContaining({
            name: 'exception',
            attributes: {
              'exception.message': 'something went wrong',
              'exception.stacktrace': 'fakeStack',
              'exception.type': 'errorCode',
            },
          })
        );

        expect(spanCreateBucket.attributes[SEMATTRS_HTTP_STATUS_CODE]).toBe(
          400
        );
      });
    });
  });

  describe('instrumentation config', () => {
    it('preRequestHook called and add request attribute to span', done => {
      mockV2AwsSend(responseMockSuccess, 'data returned from operation');
      const config = {
        preRequestHook: (
          span: Span,
          requestInfo: AwsSdkRequestHookInformation
        ) => {
          span.setAttribute(
            'attribute from hook',
            requestInfo.request.commandInput['Bucket']
          );
        },
      };

      instrumentation.disable();
      instrumentation.setConfig(config);
      instrumentation.enable();

      const s3 = new AWS.S3();
      const bucketName = 'aws-test-bucket';

      s3.createBucket({ Bucket: bucketName }, async (err, data) => {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        expect(awsSpans[0].attributes['attribute from hook']).toStrictEqual(
          bucketName
        );
        done();
      });
    });

    it('preRequestHook throws does not fail span', done => {
      mockV2AwsSend(responseMockSuccess, 'data returned from operation');
      const config = {
        preRequestHook: (span: Span, request: any) => {
          throw new Error('error from request hook');
        },
      };

      instrumentation.disable();
      instrumentation.setConfig(config);
      instrumentation.enable();

      const s3 = new AWS.S3();
      const bucketName = 'aws-test-bucket';

      s3.createBucket({ Bucket: bucketName }, async (err, data) => {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        expect(awsSpans[0].status.code).toStrictEqual(SpanStatusCode.UNSET);
        done();
      });
    });

    it('responseHook called and add response attribute to span', done => {
      mockV2AwsSend(responseMockSuccess, 'data returned from operation');
      const config = {
        responseHook: (
          span: Span,
          responseInfo: AwsSdkResponseHookInformation
        ) => {
          span.setAttribute(
            'attribute from response hook',
            responseInfo.response['data']
          );
        },
      };

      instrumentation.disable();
      instrumentation.setConfig(config);
      instrumentation.enable();

      const s3 = new AWS.S3();
      const bucketName = 'aws-test-bucket';

      s3.createBucket({ Bucket: bucketName }, async (err, data) => {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        expect(
          awsSpans[0].attributes['attribute from response hook']
        ).toStrictEqual('data returned from operation');
        done();
      });
    });

    it('suppressInternalInstrumentation set to true with send()', done => {
      mockV2AwsSend(responseMockSuccess, 'data returned from operation', true);
      const config = {
        suppressInternalInstrumentation: true,
      };

      instrumentation.disable();
      instrumentation.setConfig(config);
      instrumentation.enable();

      const s3 = new AWS.S3();

      s3.createBucket({ Bucket: 'aws-test-bucket' }, (err, data) => {
        const awsSpans = getAwsSpans();
        expect(awsSpans.length).toBe(1);
        done();
      });
    });

    it('suppressInternalInstrumentation set to true with promise()', async () => {
      mockV2AwsSend(responseMockSuccess, 'data returned from operation', true);
      const config = {
        suppressInternalInstrumentation: true,
      };

      instrumentation.disable();
      instrumentation.setConfig(config);
      instrumentation.enable();

      const s3 = new AWS.S3();

      await s3.createBucket({ Bucket: 'aws-test-bucket' }).promise();
      const awsSpans = getAwsSpans();
      expect(awsSpans.length).toBe(1);
    });
  });
});
