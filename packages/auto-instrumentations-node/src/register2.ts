/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// XXX This register2.ts will replace register.ts, but want both while in draft to compare.

import { startNodeSdk } from '@opentelemetry/sdk-node';
import { getComponentProviderRegistry, getNodeAutoInstrumentations } from './utils';

if (!process.env.OTEL_CONFIG_FILE) {
  throw new Error('XXX OTEL_CONFIG_FILE is not set, that is what we are testing now. XXX restore non-config file functionality later.')
}

// XXX module.registerHook for IITM, likely in a separate PR.

const instrumentations = getNodeAutoInstrumentations();
const registry = getComponentProviderRegistry();

const { shutdown } = startNodeSdk({
  instrumentations,
  componentProviderRegistries: [ registry ],
});

// Gracefully shutdown SDK if a SIGTERM is received
process.on('SIGTERM', shutdown);
// Gracefully shutdown SDK if Node.js is exiting normally
process.once('beforeExit', shutdown);
