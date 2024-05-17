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
import utils from '../src/pubsub-propagation';
import {
  getTestSpans,
  registerInstrumentationTestingProvider,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { expect } from 'expect';

registerInstrumentationTestingProvider();

const tracer = trace.getTracer('test');

afterEach(() => {
  resetMemoryExporter();
});

describe('Pubsub propagation', () => {
  it('Span ends immediately when the function returns a non-promise', () => {
    const messages = [{}];
    utils.patchMessagesArrayToStartProcessSpans({
      messages,
      tracer,
      parentContext: ROOT_CONTEXT,
      messageToSpanDetails: () => ({
        name: 'test',
        parentContext: ROOT_CONTEXT,
        attributes: {},
      }),
    });
    utils.patchArrayForProcessSpans(messages, tracer, ROOT_CONTEXT);

    expect(getTestSpans().length).toBe(0);

    messages.map(x => x);

    expect(getTestSpans().length).toBe(1);
    expect(getTestSpans()[0]).toMatchObject({ name: 'test process' });
  });

  it('Span ends on promise-resolution', () => {
    const messages = [{}];
    utils.patchMessagesArrayToStartProcessSpans({
      messages,
      tracer,
      parentContext: ROOT_CONTEXT,
      messageToSpanDetails: () => ({
        name: 'test',
        parentContext: ROOT_CONTEXT,
        attributes: {},
      }),
    });
    utils.patchArrayForProcessSpans(messages, tracer, ROOT_CONTEXT);

    expect(getTestSpans().length).toBe(0);

    let resolve: (value: unknown) => void;

    messages.map(
      () =>
        new Promise(res => {
          resolve = res;
        })
    );

    expect(getTestSpans().length).toBe(0);

    // @ts-expect-error Typescript thinks this value is used before assignment
    resolve(undefined);

    // We use setTimeout here to make sure our assertions run
    // after the promise resolves
    return new Promise(res => setTimeout(res, 0)).then(() => {
      expect(getTestSpans().length).toBe(1);
      expect(getTestSpans()[0]).toMatchObject({ name: 'test process' });
    });
  });

  it('Span ends on promise-rejection', () => {
    const messages = [{}];
    utils.patchMessagesArrayToStartProcessSpans({
      messages,
      tracer,
      parentContext: ROOT_CONTEXT,
      messageToSpanDetails: () => ({
        name: 'test',
        parentContext: ROOT_CONTEXT,
        attributes: {},
      }),
    });
    utils.patchArrayForProcessSpans(messages, tracer, ROOT_CONTEXT);

    expect(getTestSpans().length).toBe(0);

    let reject: (value: unknown) => void;

    messages.map(
      () =>
        new Promise((_, rej) => {
          reject = rej;
        })
    );

    expect(getTestSpans().length).toBe(0);

    // @ts-expect-error Typescript thinks this value is used before assignment
    reject(new Error('Failed'));

    // We use setTimeout here to make sure our assertions run
    // after the promise resolves
    return new Promise(res => setTimeout(res, 0)).then(() => {
      expect(getTestSpans().length).toBe(1);
      expect(getTestSpans()[0]).toMatchObject({ name: 'test process' });
    });
  });
});
