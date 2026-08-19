/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');
const { ClaudeAgentSDKInstrumentation } = require('../../build/src');

function createQuery(messages) {
  const query = (async function* () {
    for (const message of messages) {
      yield message;
    }
  })();
  query.close = () => {};
  return query;
}

async function main() {
  const exporter = new OTLPTraceExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const instrumentation = new ClaudeAgentSDKInstrumentation();
  instrumentation.setTracerProvider(provider);
  const sdk = instrumentation.manuallyInstrument({
    query() {
      return createQuery([
        {
          type: 'system',
          subtype: 'init',
          session_id: 'session-conformance',
          model: 'claude-sonnet-4-5',
        },
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 10,
          duration_api_ms: 8,
          is_error: false,
          num_turns: 1,
          stop_reason: 'end_turn',
          total_cost_usd: 0,
          usage: {
            input_tokens: 7,
            output_tokens: 4,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          result: 'OpenTelemetry records telemetry.',
          uuid: 'result-conformance',
          session_id: 'session-conformance',
        },
      ]);
    },
  });

  for await (const message of sdk.query({
    prompt: 'What does OpenTelemetry record?',
    options: { model: 'claude-sonnet-4-5' },
  })) {
    void message;
  }

  await provider.forceFlush();
  instrumentation.disable();
  await provider.shutdown();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
