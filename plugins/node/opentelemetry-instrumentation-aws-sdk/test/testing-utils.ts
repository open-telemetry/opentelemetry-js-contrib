import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { getInstrumentation } from '@opentelemetry/contrib-test-utils';
import * as expect from 'expect';
import * as AWS from 'aws-sdk';

export const mockV2AwsSend = (
    sendResult: any,
    data: any = undefined,
    expectedInstrumentationSuppressed: boolean = false
) => {
    // since we are setting a new value to a function being patched by the instrumentation, 
    // we need to disable and enable again to make the patch for the new function.
    // I would like to see another pattern for this in the future, for example - patching only
    // once and just setting the result and data, or patching the http layer instead with nock package.
    getInstrumentation()?.disable();
    AWS.Request.prototype.send = function (cb?: (error: any, response: any) => void) {
        expect(isTracingSuppressed(context.active())).toStrictEqual(expectedInstrumentationSuppressed);
        if (cb) {
            (this as AWS.Request<any, any>).on('complete', (response) => {
                cb(response.error, response);
            });
        }
        const response = {
            ...sendResult,
            data,
            request: this,
        };
        setImmediate(() => {
            // @ts-ignore we want to emit the event from mock, but the public interface does not expose such functionality
            this._events.complete.forEach((handler: (response: AWS.Response<any, any>) => void) => handler(response));
        });
        return response;
    };

    AWS.Request.prototype.promise = function () {
        expect(isTracingSuppressed(context.active())).toStrictEqual(expectedInstrumentationSuppressed);
        const response = {
            ...sendResult,
            data,
            request: this,
        };
        setImmediate(() => {
            // @ts-ignore we want to emit the event from mock, but the public interface does not expose such functionality
            this._events.complete.forEach((handler: (response: AWS.Response<any, any>) => void) => handler(response));
        });
        return new Promise((resolve) =>
            setImmediate(() => {
                resolve(data);
            })
        );
    };
    getInstrumentation()?.enable();
};
