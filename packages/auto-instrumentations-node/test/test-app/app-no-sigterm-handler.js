/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Used in register.test.ts to mimic a long-running JS app that does NOT install a
// SIGTERM handler of its own, and therefore relies on Node's default behaviour of
// terminating on SIGTERM. This is the common case for simple servers, and the case
// in which a SIGTERM listener added by the register hook changes the app's lifecycle.
const http = require('http');

const server = http.createServer((req, res) => {
  res.end('ok');
});

// Make sure there is work on the event loop, so the process stays alive for
// reasons unrelated to the listening socket.
setInterval(() => {}, 1000);

server.listen(0, () => {
  console.log('listening');
});
