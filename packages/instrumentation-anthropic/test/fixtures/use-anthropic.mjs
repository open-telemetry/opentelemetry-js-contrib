/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use the Anthropic SDK from an ES module, which resolves the SDK's `.mjs`
// build rather than its CommonJS one:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-anthropic.mjs

import { createServer } from 'node:http';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { AnthropicInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-anthropic',
  instrumentations: [new AnthropicInstrumentation()],
});
sdk.start();

import Anthropic from '@anthropic-ai/sdk';

// A local stand-in for the API, so the fixture makes a real request without
// reaching the network.
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'msg_01234567890',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'text', text: 'Hello telemetry' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3 },
    })
  );
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const client = new Anthropic({
  apiKey: 'testing',
  maxRetries: 0,
  baseURL: `http://127.0.0.1:${port}`,
});

const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 16,
  messages: [{ role: 'user', content: 'Reply with exactly two words' }],
});

process.stdout.write(JSON.stringify({ id: response.id }) + '\n');

server.close();
await sdk.shutdown();
