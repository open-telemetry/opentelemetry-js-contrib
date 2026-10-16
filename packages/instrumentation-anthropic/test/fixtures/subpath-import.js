/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Build a client from the SDK's `client` subpath, as the Bedrock and Vertex
// packages do, and make a call through it. Runs in its own process so that the
// package root is never loaded: an in-process test cannot prove this, because
// importing the root anywhere else would patch the shared module anyway.
const path = require('node:path');
const nock = require('nock');

const nockBack = nock.back;
const { createTestNodeSdk } = require('@opentelemetry/contrib-test-utils');

const { AnthropicInstrumentation } = require('../../build/src');

const sdk = createTestNodeSdk({
  serviceName: 'use-anthropic-subpath',
  instrumentations: [new AnthropicInstrumentation()],
});
sdk.start();

const { Anthropic } = require('@anthropic-ai/sdk/client');

// The same cassette the in-process tests replay.
nockBack.fixtures = path.join(__dirname, '..', 'mock-responses');
nockBack.setMode('lockdown');
// `lockdown` disables every outbound connection, including the fixture
// collector's, so localhost is allowed back through.
nock.enableNetConnect(host => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));

async function main() {
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

  // Let the span reach the fixture collector: the cassette is finished with,
  // and lockdown otherwise blocks the exporter too.
  nock.cleanAll();
  nock.enableNetConnect();
  await sdk.shutdown();
}

main();
