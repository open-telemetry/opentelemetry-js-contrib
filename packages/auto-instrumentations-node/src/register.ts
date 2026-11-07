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

// Listeners already registered when this entry point is loaded cannot be the
// application's own choice about its lifecycle: this module runs under
// `--require`, before the application's first line. They belong to other
// preloaded tooling — coverage harnesses and process wrappers typically install
// one — which is why the decision below counts listeners relative to this
// baseline rather than against zero.
const sigtermListenersBeforeRegister = process.listenerCount('SIGTERM');

// Gracefully shutdown SDK if a SIGTERM is received.
//
// Registering any SIGTERM listener replaces Node.js's default behaviour of
// terminating on the signal, so this handler has to restore it: it is
// registered with `once` (removing itself before it runs) and re-raises the
// signal once the shutdown has settled, unless the application has registered a
// listener of its own in the meantime. An application that handles SIGTERM
// keeps control of its lifecycle and receives the signal exactly once; an
// application that does not — the common case — still terminates, with the exit
// status a signal death produces, rather than running until its orchestrator's
// grace period expires.
process.once('SIGTERM', () => {
  void shutdown().then(() => {
    // This handler has already removed itself, so anything above the baseline
    // was added by the application.
    if (process.listenerCount('SIGTERM') <= sigtermListenersBeforeRegister) {
      process.kill(process.pid, 'SIGTERM');
    }
  });
});
// Gracefully shutdown SDK if Node.js is exiting normally
process.once('beforeExit', shutdown);
