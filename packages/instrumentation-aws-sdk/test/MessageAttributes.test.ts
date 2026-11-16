/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, TraceFlags, trace } from '@opentelemetry/api';
import type { SpanContext } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { expect } from 'expect';
import {
  MAX_MESSAGE_ATTRIBUTES,
  contextGetter,
  contextSetter,
  injectPropagationContext,
  addPropagationFieldsToAttributeNames,
} from '../src/services/MessageAttributes';
import { SNS, SQS } from '../src/aws-sdk.types';

describe('MessageAttributes', () => {
  const traceId = '0af7651916cd43dd8448eb211c80319c';
  const spanId = 'b7ad6b7169203331';
  const traceparent = `00-${traceId}-${spanId}-01`;

  const createMessageAttributes = (
    count: number
  ): SQS.MessageBodyAttributeMap => {
    const attributes: SQS.MessageBodyAttributeMap = {};
    for (let index = 1; index <= count; index++) {
      attributes[`key${index}`] = {
        DataType: 'String',
        StringValue: `value${index}`,
      };
    }
    return attributes;
  };

  const injectWithTraceState = (
    attributes: SQS.MessageBodyAttributeMap,
    traceState: TraceState
  ) => {
    const spanContext: SpanContext = {
      traceId,
      spanId,
      traceFlags: TraceFlags.SAMPLED,
      traceState,
    };
    const activeContext = trace.setSpan(
      context.active(),
      trace.wrapSpanContext(spanContext)
    );
    return context.with(activeContext, () =>
      injectPropagationContext(attributes)
    );
  };

  describe('MAX_MESSAGE_ATTRIBUTES', () => {
    it('should be 10', () => {
      expect(MAX_MESSAGE_ATTRIBUTES).toBe(10);
    });
  });

  describe('contextGetter', () => {
    it('returns context keys if there are available attributes', () => {
      const contextCarrier = {
        key1: { DataType: 'String', StringValue: 'value1' },
      };
      const expectedKeys = ['key1'];

      expect(contextGetter.keys(contextCarrier)).toEqual(expectedKeys);
    });

    it('returns empty context keys if there are no available attributes', () => {
      const contextCarrier = undefined;
      const expectedKeys: string[] = [];

      expect(
        contextGetter.keys(
          contextCarrier as unknown as
            | SQS.MessageBodyAttributeMap
            | SNS.MessageAttributeMap
        )
      ).toEqual(expectedKeys);
    });
  });

  describe('contextSetter', () => {
    it('should set parent context in sqs receive callback', () => {
      const contextKey = 'key';
      const contextValue = 'value';
      const contextCarrier = {};
      contextSetter.set(contextCarrier, contextKey, contextValue);

      const expectedContext = {
        [contextKey]: { DataType: 'String', StringValue: contextValue },
      };
      expect(contextCarrier).toStrictEqual(expectedContext);
    });
  });

  describe('injectPropagationContext', () => {
    it('injects traceparent without an empty tracestate attribute', () => {
      const attributes = injectWithTraceState({}, new TraceState());

      expect(attributes).toStrictEqual({
        traceparent: { DataType: 'String', StringValue: traceparent },
      });
    });

    it('injects traceparent and a non-empty tracestate', () => {
      const attributes = injectWithTraceState(
        {},
        new TraceState('vendor=value')
      );

      expect(attributes).toStrictEqual({
        traceparent: { DataType: 'String', StringValue: traceparent },
        tracestate: { DataType: 'String', StringValue: 'vendor=value' },
      });
    });

    it('injects two non-empty propagation fields at the attribute limit', () => {
      const attributes = injectWithTraceState(
        createMessageAttributes(8),
        new TraceState('vendor=value')
      );

      expect(Object.keys(attributes)).toHaveLength(MAX_MESSAGE_ATTRIBUTES);
      expect(attributes.traceparent).toStrictEqual({
        DataType: 'String',
        StringValue: traceparent,
      });
      expect(attributes.tracestate).toStrictEqual({
        DataType: 'String',
        StringValue: 'vendor=value',
      });
    });

    it('counts an existing propagation key once at the attribute limit', () => {
      const existingAttributes = createMessageAttributes(8);
      existingAttributes.traceparent = {
        DataType: 'String',
        StringValue: 'stale',
      };

      const attributes = injectWithTraceState(
        existingAttributes,
        new TraceState('vendor=value')
      );

      expect(Object.keys(attributes)).toHaveLength(MAX_MESSAGE_ATTRIBUTES);
      expect(attributes.traceparent).toStrictEqual({
        DataType: 'String',
        StringValue: traceparent,
      });
      expect(attributes.tracestate).toStrictEqual({
        DataType: 'String',
        StringValue: 'vendor=value',
      });
    });

    it('injects only traceparent at the attribute limit for empty tracestate', () => {
      const attributes = injectWithTraceState(
        createMessageAttributes(9),
        new TraceState()
      );

      expect(Object.keys(attributes)).toHaveLength(MAX_MESSAGE_ATTRIBUTES);
      expect(attributes.traceparent).toStrictEqual({
        DataType: 'String',
        StringValue: traceparent,
      });
      expect(attributes.tracestate).toBeUndefined();
    });

    it('does not partially inject when non-empty propagation fields exceed the limit', () => {
      const originalAttributes = createMessageAttributes(9);
      const attributes = injectWithTraceState(
        { ...originalAttributes },
        new TraceState('vendor=value')
      );

      expect(attributes).toStrictEqual(originalAttributes);
    });

    it('does not inject into a carrier already at the attribute limit', () => {
      const originalAttributes = createMessageAttributes(10);
      const attributes = injectWithTraceState(
        { ...originalAttributes },
        new TraceState()
      );

      expect(attributes).toStrictEqual(originalAttributes);
    });
  });

  describe('addPropagationFieldsToAttributeNames', () => {
    const messageAttributeNames = ['name 1', 'name 2', 'name 1'];
    const propagationFields = ['traceparent'];

    it('should remove duplicate message attribute names and add propagation fields', () => {
      expect(
        addPropagationFieldsToAttributeNames(
          messageAttributeNames,
          propagationFields
        )
      ).toEqual(['name 1', 'name 2', 'traceparent']);
    });

    it('should return propagation fields if no message attribute names are set', () => {
      expect(
        addPropagationFieldsToAttributeNames(undefined, propagationFields)
      ).toEqual(['traceparent']);
    });
  });
});
