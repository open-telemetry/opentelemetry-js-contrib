/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// The equivalent of "app.js", but showing usage with ESM code.
// Usage:
//    node --require ./telemetry.js --experimental-loader ../node_modules/@opentelemetry/instrumentation/hook.mjs app.js

import { trace } from '@opentelemetry/api';
import bunyan from 'bunyan';

const log = bunyan.createLogger({ name: 'myapp', level: 'debug' });

log.debug({ foo: 'bar' }, 'hi');

const tracer = trace.getTracer('example');
tracer.startActiveSpan('manual-span', span => {
  log.info('this record will have trace_id et al fields for the current span');
  span.end();
});
