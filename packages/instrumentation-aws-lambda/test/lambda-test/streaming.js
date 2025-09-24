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
/* eslint-disable no-unused-vars */
const api = require('@opentelemetry/api');
const {
  AWS_HANDLER_STREAMING_SYMBOL,
  AWS_HANDLER_STREAMING_RESPONSE,
} = require('../../src/instrumentation');

const HIGH_WATER_MARK_SYMBOL = Symbol.for(
  'aws.lambda.runtime.handler.streaming.highWaterMark'
);

exports.HIGH_WATER_MARK_SYMBOL = HIGH_WATER_MARK_SYMBOL;

function streamifyResponse(handler, highWaterMark) {
  handler[AWS_HANDLER_STREAMING_SYMBOL] = AWS_HANDLER_STREAMING_RESPONSE;

  if (typeof highWaterMark === 'number') {
    handler[HIGH_WATER_MARK_SYMBOL] = highWaterMark;
  }

  return handler;
}

exports.handler = streamifyResponse(
  async (_event, responseStream, _context) => {
    responseStream.write('{"message": "ok"}');
    responseStream.end();
    return 'stream-ok';
  }
);

exports.error = streamifyResponse(async (_event, _responseStream, _context) => {
  throw new Error('handler error');
});

exports.stringerror = streamifyResponse(
  async (_event, _responseStream, _context) => {
    throw 'handler error';
  }
);

exports.context = streamifyResponse(
  async (_event, responseStream, _lambdaContext) => {
    const traceId = api.trace
      .getSpan(api.context.active())
      .spanContext().traceId;
    responseStream.write(`{"traceId": "${traceId}"}`);
    responseStream.end();
    return traceId;
  }
);

exports.errorAfterWrite = streamifyResponse(
  async (_event, responseStream, _context) => {
    responseStream.write('{"start": "ok"}');
    throw new Error('handler error after write');
  }
);

exports.syncHandler = streamifyResponse((_event, responseStream, _context) => {
  responseStream.write('{"sync": "ok"}');
  responseStream.end();
  return 'sync-ok';
});

exports.promiseReject = streamifyResponse(
  async (_event, _responseStream, _context) => {
    return Promise.reject(new Error('promise rejection error'));
  }
);

exports.handlerWithCustomHighWaterMark = streamifyResponse(
  async (_event, responseStream, _context) => {
    responseStream.write('{"message": "custom"}');
    responseStream.end();
    return 'custom-ok';
  },
  32768 // Custom high water mark
);
