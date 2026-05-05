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

const sdk = new opentelemetry.NodeSDK({
  instrumentations: getNodeAutoInstrumentations(),
  resourceDetectors: getResourceDetectorsFromEnv(),
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

// Opt-in: flush telemetry before the process dies on a crash signal.
// `beforeExit` does not fire on uncaught exceptions, unhandled rejections,
// or process.exit(), so batched logs/spans/metrics in the BatchProcessor
// queues are lost. When OTEL_NODE_FLUSH_ON_CRASH=true, register handlers
// that race sdk.shutdown() against a bounded timeout, then re-raise the
// original termination semantics by exiting non-zero.
const flushOnCrash =
  getStringFromEnv('OTEL_NODE_FLUSH_ON_CRASH')?.toLowerCase() === 'true';

if (flushOnCrash) {
  const timeoutEnv = getStringFromEnv('OTEL_NODE_FLUSH_ON_CRASH_TIMEOUT_MS');
  const parsedTimeout = timeoutEnv != null ? Number(timeoutEnv) : NaN;
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5000;

  const shutdownWithTimeout = (): Promise<void> => {
    return Promise.race([
      shutdown(),
      new Promise<void>(resolve => {
        // unref() so a wedged exporter doesn't keep the process alive
        // longer than the user's timeout budget.
        setTimeout(resolve, timeoutMs).unref();
      }),
    ]);
  };

  let crashing = false;
  const handleFatal = async (
    label: 'uncaughtException' | 'unhandledRejection',
    err: unknown
  ): Promise<void> => {
    // Re-entrancy guard: if shutdown itself throws, don't recurse forever.
    if (crashing) {
      process.exit(1);
    }
    crashing = true;

    // Preserve the original crash output — users still need to see the error.
    // eslint-disable-next-line no-console
    console.error(`[otel] flushing telemetry before exit (${label}):`, err);

    await shutdownWithTimeout();
    process.exit(1);
  };

  process.on('uncaughtException', err => {
    void handleFatal('uncaughtException', err);
  });
  process.on('unhandledRejection', reason => {
    void handleFatal('unhandledRejection', reason);
  });
  process.on('SIGINT', async () => {
    await shutdownWithTimeout();
    process.exit(130); // 128 + SIGINT(2)
  });
}
