/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs in its own process so that only the SDK subpath is ever loaded. An
// in-process test cannot prove this: importing the package root anywhere else
// would patch the shared module anyway.
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { AnthropicInstrumentation } = require('../../build/src');

registerInstrumentations({ instrumentations: [new AnthropicInstrumentation()] });

const { Anthropic } = require('@anthropic-ai/sdk/client');
const client = new Anthropic({ apiKey: 'testing' });

process.stdout.write(
  JSON.stringify({ wrapped: Boolean(client.messages.create.__wrapped) })
);
