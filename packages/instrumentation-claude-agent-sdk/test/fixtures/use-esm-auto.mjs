/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import {
  ClaudeAgentSDKInstrumentation,
  isPatched,
} from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'claude-agent-sdk-esm-auto-test',
  instrumentations: [new ClaudeAgentSDKInstrumentation()],
});
sdk.start();

const claudeAgentSDK = await import('@anthropic-ai/claude-agent-sdk');

if (!isPatched()) {
  throw new Error('Claude Agent SDK instrumentation patch hook did not run');
}
if (claudeAgentSDK.query.name !== 'wrappedQuery') {
  throw new Error('Claude Agent SDK live query binding was not patched');
}

await sdk.shutdown();
