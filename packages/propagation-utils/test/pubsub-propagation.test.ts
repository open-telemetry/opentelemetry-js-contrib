/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
