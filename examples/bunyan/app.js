/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// A small example that shows using OpenTelemetry's instrumentation of
// Bunyan loggers. Usage:
//    node --require ./telemetry.js app.js

const otel = require('@opentelemetry/api');
const bunyan = require('bunyan');

const log = bunyan.createLogger({ name: 'myapp', level: 'debug' });

log.debug({ foo: 'bar' }, 'hi');

const tracer = otel.trace.getTracer('example');
tracer.startActiveSpan('manual-span', span => {
  log.info('this record will have trace_id et al fields for the current span');
  span.end();
});
