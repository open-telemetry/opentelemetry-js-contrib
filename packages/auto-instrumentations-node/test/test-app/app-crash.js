/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

//Used in register.test.ts to mimic a JS app that crashes.
const http = require('http');

const crashMode = process.env.TEST_APP_CRASH_MODE;

if (crashMode === 'handled') {
  // The application handles uncaught exceptions itself and keeps running.
  process.on('uncaughtException', err => {
    console.log(`app handled: ${err.message}`);
  });
}

const req = http.request({
  hostname: '127.0.0.1',
  port: 1,
  path: '/',
  method: 'GET',
});

// Connection will fail immediately with ECONNREFUSED, but the HTTP
// instrumentation will still create a span for the request.
req.on('error', () => {
  if (crashMode === 'reject') {
    Promise.reject(new Error('test app rejection'));
  } else {
    throw new Error('test app crash');
  }
});

req.end();
