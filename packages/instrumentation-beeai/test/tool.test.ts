/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import {
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
} from '@opentelemetry/genai-util';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import { z } from 'zod';

import { instrumentation } from './load-instrumentation';
import {
  DynamicTool,
  JSONToolOutput,
  StringToolOutput,
} from 'beeai-framework/tools/base';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  CAPTURE_ENV_KEY,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - Tool', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('Tool instrumentation (ToolInvocation)', () => {
    it('emits an INTERNAL execute_tool span without arguments or result by default', async () => {
      const calculator = new DynamicTool({
        name: 'calculator',
        description: 'Evaluates expressions',
        inputSchema: z.object({ expression: z.string() }),
        handler: async input =>
          new StringToolOutput(`result:${input.expression}`),
      });

      const output = await calculator.run({ expression: '2+2' });
      expect(output.getTextContent()).toBe('result:2+2');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.name).toBe('execute_tool calculator');
      expect(span.kind).toBe(SpanKind.INTERNAL);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('calculator');
      expect(span.attributes[ATTR_GEN_AI_TOOL_DESCRIPTION]).toBe(
        'Evaluates expressions'
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_TYPE]).toBe(
        GEN_AI_TOOL_TYPE_VALUE_FUNCTION
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBeUndefined();

      const { resourceMetrics } = await getMetricReader().collect();
      const toolDuration = resourceMetrics.scopeMetrics[0]?.metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_EXECUTE_TOOL_DURATION
      );
      expect(toolDuration?.dataPoints.length).toBe(1);
    });

    it('captures tool arguments and results without stripping user domain keys when content capture is enabled', async () => {
      process.env[CAPTURE_ENV_KEY] = 'span_only';

      const jsonTool = new DynamicTool({
        name: 'weather_lookup',
        description: 'Fetches weather data',
        inputSchema: z.object({
          city: z.string(),
          result: z.string().optional(),
          _id: z.string().optional(),
        }),
        handler: async input =>
          new JSONToolOutput({
            _id: input._id ?? 'doc_1',
            city: input.city,
            tempC: 22,
            tokens: ['user-domain-token'],
            client: { name: 'weather-api' },
            createdBy: { id: 5 },
          }),
      });

      const output = await jsonTool.run({
        city: 'Berlin',
        result: 'expected-input-field',
        _id: 'req_42',
      });
      expect(output.result.city).toBe('Berlin');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string)
      ).toEqual({
        city: 'Berlin',
        result: 'expected-input-field',
        _id: 'req_42',
      });
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT] as string)
      ).toEqual({
        _id: 'req_42',
        city: 'Berlin',
        tempC: 22,
        tokens: ['user-domain-token'],
        client: { name: 'weather-api' },
        createdBy: { id: 5 },
      });
    });

    it('records error telemetry on tool failure without setting tool.call.result', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const failingTool = new DynamicTool({
        name: 'failing_tool',
        description: 'Always throws',
        inputSchema: z.object({ query: z.string() }),
        handler: async () => {
          throw new Error('Database connection failed');
        },
      });

      await expect(failingTool.run({ query: 'test' })).rejects.toThrow();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('ToolError');
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string)
      ).toEqual({ query: 'test' });
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBeUndefined();
    });
  });
});
