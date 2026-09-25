/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use the Anthropic SDK from an ES module, which resolves the SDK's `.mjs`
// build rather than its CommonJS one:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-anthropic.mjs

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// nock is CommonJS, so its named exports are not available to ESM.
import nock from 'nock';

const nockBack = nock.back;
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { AnthropicInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-anthropic',
  instrumentations: [new AnthropicInstrumentation()],
});
sdk.start();

import Anthropic from '@anthropic-ai/sdk';

// The same cassette the in-process tests replay.
nockBack.fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'mock-responses'
);
nockBack.setMode('lockdown');
// `lockdown` disables every outbound connection, including the fixture
// collector's, so localhost is allowed back through.
nock.enableNetConnect(host => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));

const { nockDone } = await nockBack('anthropic-messages-create.json');
try {
  const client = new Anthropic({ apiKey: 'testing', maxRetries: 0 });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16,
    messages: [
      {
        role: 'user',
        content: 'Reply with exactly two words: Hello telemetry',
      },
    ],
  });
  process.stdout.write(JSON.stringify({ id: response.id }) + '\n');
} finally {
  nockDone();
}

// Let the span reach the fixture collector: the cassette is finished with, and
// lockdown otherwise blocks the exporter too.
nock.cleanAll();
nock.enableNetConnect();

await sdk.shutdown();
