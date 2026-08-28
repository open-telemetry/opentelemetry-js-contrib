/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { ClaudeAgentSDKInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'claude-agent-sdk-esm-auto-test',
  instrumentations: [new ClaudeAgentSDKInstrumentation()],
});
sdk.start();

const claudeAgentSDK = await import('@anthropic-ai/claude-agent-sdk');

if (claudeAgentSDK.query.name !== 'patchedQuery') {
  throw new Error('Claude Agent SDK live query binding was not patched');
}

await sdk.shutdown();
