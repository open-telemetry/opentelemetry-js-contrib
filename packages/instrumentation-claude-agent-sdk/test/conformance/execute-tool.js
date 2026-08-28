/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { ClaudeAgentSDKInstrumentation } = require('../../build/src');
const { configureTelemetry } = require('./telemetry');

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
  const instrumentation = new ClaudeAgentSDKInstrumentation();
  const shutdown = configureTelemetry(instrumentation);
  let queryOptions;
  const sdk = instrumentation.manuallyInstrument({
    query(params) {
      queryOptions = params.options;
      return createQuery([
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
          result: 'Done',
          uuid: 'result-conformance',
          session_id: 'session-conformance',
        },
      ]);
    },
  });

  const query = sdk.query({ prompt: 'Read package.json' });
  const preToolUse = queryOptions.hooks.PreToolUse.at(-1).hooks[0];
  const postToolUse = queryOptions.hooks.PostToolUse.at(-1).hooks[0];
  const signal = new AbortController().signal;
  await preToolUse(
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'package.json' },
      tool_use_id: 'tool-conformance',
      session_id: 'session-conformance',
      transcript_path: 'transcript.jsonl',
      cwd: process.cwd(),
    },
    'tool-conformance',
    { signal }
  );
  await postToolUse(
    {
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'package.json' },
      tool_response: { content: '{}' },
      tool_use_id: 'tool-conformance',
      session_id: 'session-conformance',
      transcript_path: 'transcript.jsonl',
      cwd: process.cwd(),
    },
    'tool-conformance',
    { signal }
  );

  for await (const message of query) {
    void message;
  }

  await shutdown();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
