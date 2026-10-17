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

// Gracefully shutdown SDK if a SIGTERM is received
process.on('SIGTERM', shutdown);
// Gracefully shutdown SDK if Node.js is exiting normally
process.once('beforeExit', shutdown);

// Opt-in: shut down the SDK before the process dies from an uncaught
// exception. `beforeExit` does not fire in that case, so telemetry still
// buffered in batch processors is dropped. Unhandled promise rejections are
// covered too: with Node's default `--unhandled-rejections=throw` they are
// raised as uncaught exceptions.
const flushOnCrash =
  getStringFromEnv('OTEL_NODE_FLUSH_ON_CRASH')?.toLowerCase() === 'true';

if (flushOnCrash) {
  const timeoutEnv = getStringFromEnv('OTEL_NODE_FLUSH_ON_CRASH_TIMEOUT_MS');
  const parsedTimeout = timeoutEnv != null ? Number(timeoutEnv) : NaN;
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5000;

  let crashing = false;
  const onUncaughtException = async (error: Error): Promise<void> => {
    // Another listener means the application handles uncaught exceptions
    // itself and decides whether the process keeps running.
    if (process.listenerCount('uncaughtException') > 1) {
      return;
    }
    // An exception thrown while shutting down: give up on flushing.
    if (crashing) {
      process.exit(1);
    }
    crashing = true;
    // Registering this listener suppresses Node's default error output and
    // exit, so reproduce both: print the error, then exit with status 1.
    process.exitCode = 1;
    console.error(error);

    await Promise.race([
      shutdown(),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
    process.exit(1);
  };

  process.on('uncaughtException', onUncaughtException);
}
