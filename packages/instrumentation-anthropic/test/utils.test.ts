/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import './load-instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import { expect } from 'expect';
import { ResponseRecorder } from '../src/utils';

describe('ResponseRecorder', () => {
  const handler = new TelemetryHandler({
    instrumentationName: 'test',
    instrumentationVersion: '0.0.0',
  });

  beforeEach(() => {
    resetMemoryExporter();
  });

  it('counts prompt cache reads and writes as input tokens', () => {
    const invocation = handler.startInference({ providerName: 'anthropic' });
    new ResponseRecorder(invocation).recordMessage({
      id: 'msg_1',
      model: 'claude',
      stop_reason: 'max_tokens',
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 3,
        output_tokens: 2,
      },
    });
    invocation.stop();

    expect(getTestSpans()[0].attributes).toMatchObject({
      'gen_ai.response.id': 'msg_1',
      'gen_ai.response.model': 'claude',
      'gen_ai.response.finish_reasons': ['max_tokens'],
      'gen_ai.usage.input_tokens': 18,
      'gen_ai.usage.cache_read.input_tokens': 5,
      'gen_ai.usage.cache_write.input_tokens': 3,
      'gen_ai.usage.output_tokens': 2,
    });
  });

  it('merges usage reported across stream events', () => {
    const invocation = handler.startInference({ providerName: 'anthropic' });
    const recorder = new ResponseRecorder(invocation);
    recorder.recordStreamEvent({
      type: 'message_start',
      message: {
        id: 'msg_2',
        model: 'claude',
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    });
    recorder.recordStreamEvent({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 7 },
    });
    invocation.stop();

    expect(getTestSpans()[0].attributes).toMatchObject({
      'gen_ai.response.finish_reasons': ['end_turn'],
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.output_tokens': 7,
    });
  });
});
