/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The equivalent of "app.js", but showing usage with ESM code.
// Usage:
//    node --require ./telemetry.js --experimental-loader ../node_modules/@opentelemetry/instrumentation/hook.mjs app.js

import { trace } from '@opentelemetry/api';
import bunyan from 'bunyan';

const log = bunyan.createLogger({name: 'myapp', level: 'debug'});

log.debug({foo: 'bar'}, 'hi');

const tracer = trace.getTracer('example');
tracer.startActiveSpan('manual-span', span => {
  log.info('this record will have trace_id et al fields for the current span');
  span.end();
});

