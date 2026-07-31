/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

//Used in register.test.ts to mimic a JS app.
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 1,
  path: '/',
  method: 'GET',
};

const req = http.request(options);

// Connection will fail immediately with ECONNREFUSED, but the HTTP
// instrumentation will still create a span for the request.
req.on('error', () => {
  // Expected error, silently handle it
  // The span has already been created by the instrumentation
});

req.end();
