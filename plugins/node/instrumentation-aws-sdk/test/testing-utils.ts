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
import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { getInstrumentation } from '@opentelemetry/contrib-test-utils';
import { expect } from 'expect';
import * as AWS from 'aws-sdk';

// we want to mock the request object and trigger events on it's events emitter.
// the event emitter is not part of the public interface, so we create a type
// for the mock to use it.
type CompleteEventHandler = (response: AWS.Response<any, any>) => void;
type RequestWithEvents = AWS.Request<any, any> & {
  _events: { complete: CompleteEventHandler[] };
};

export const mockV2AwsSend = (
  sendResult: any,
  data: any = undefined,
  expectedInstrumentationSuppressed = false
) => {
  // since we are setting a new value to a function being patched by the instrumentation,
  // we need to disable and enable again to make the patch for the new function.
  // I would like to see another pattern for this in the future, for example - patching only
  // once and just setting the result and data, or patching the http layer instead with nock package.
  getInstrumentation()?.disable();
  AWS.Request.prototype.send = function (
    this: RequestWithEvents,
    cb?: (error: any, response: any) => void
  ) {
    expect(isTracingSuppressed(context.active())).toStrictEqual(
      expectedInstrumentationSuppressed
    );
    if (cb) {
      (this as AWS.Request<any, any>).on('complete', response => {
        cb(response.error, response);
      });
    }
    const response = {
      ...sendResult,
      data,
      request: this,
    };
    setImmediate(() => {
      this._events.complete.forEach(
        (handler: (response: AWS.Response<any, any>) => void) =>
          handler(response)
      );
    });
    return response;
  };

  AWS.Request.prototype.promise = function (this: RequestWithEvents) {
    expect(isTracingSuppressed(context.active())).toStrictEqual(
      expectedInstrumentationSuppressed
    );
    const response = {
      ...sendResult,
      data,
      request: this,
    };
    setImmediate(() => {
      this._events.complete.forEach(
        (handler: (response: AWS.Response<any, any>) => void) =>
          handler(response)
      );
    });
    return new Promise(resolve =>
      setImmediate(() => {
        resolve(data);
      })
    );
  };
  getInstrumentation()?.enable();
};
