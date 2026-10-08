/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as opentelemetry from '@opentelemetry/sdk-node';
import { diag, DiagConsoleLogger } from '@opentelemetry/api';
import { getStringFromEnv, diagLogLevelFromString } from '@opentelemetry/core';
import {
  getNodeAutoInstrumentations,
  getResourceDetectorsFromEnv,
} from './utils';

const logLevel = getStringFromEnv('OTEL_LOG_LEVEL');
if (logLevel != null) {
  diag.setLogger(new DiagConsoleLogger(), {
    logLevel: diagLogLevelFromString(logLevel),
  });
}

const instrumentations = getNodeAutoInstrumentations();
const resourceDetectors = getResourceDetectorsFromEnv();

// `NodeSDK` registers its own `DiagConsoleLogger` based on `OTEL_LOG_LEVEL`
// internally, so disable the logger set up above to avoid the "Current
// logger will be overwritten" warning being logged on every start.
if (logLevel != null) {
  diag.disable();
}

const sdk = new opentelemetry.NodeSDK({
  instrumentations,
  resourceDetectors,
});

try {
  sdk.start();
  diag.info('OpenTelemetry automatic instrumentation started successfully');
} catch (error) {
  diag.error(
    'Error initializing OpenTelemetry SDK. Your application is not instrumented and will not produce telemetry',
    error
  );
}

async function shutdown(): Promise<void> {
  try {
    await sdk.shutdown();
    diag.debug('OpenTelemetry SDK terminated');
  } catch (error) {
    diag.error('Error terminating OpenTelemetry SDK', error);
  }
}

// Gracefully shut down the SDK if a SIGTERM is received. Registering a signal
// listener suppresses Node's default exit. If this is the only SIGTERM listener,
// exit with the default status after flushing; otherwise let the other signal
// listeners manage process shutdown.
async function shutdownOnSigterm(): Promise<void> {
  const hasOtherSigtermListener = process.listenerCount('SIGTERM') > 1;
  await shutdown();
  if (!hasOtherSigtermListener) {
    process.exit(128 + 15);
  }
}

process.on('SIGTERM', shutdownOnSigterm);
// Gracefully shutdown SDK if Node.js is exiting normally
process.once('beforeExit', shutdown);
