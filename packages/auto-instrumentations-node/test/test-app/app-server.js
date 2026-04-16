/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

//Used in register.test.ts to mimic a JS app that stays alive like a server.
const http = require('http');

// Create a local server that responds immediately
const server = http.createServer((req, res) => {
  res.end('ok');
});

server.listen(0, () => {
  const port = server.address().port;
  const req = http.request({
    hostname: 'localhost',
    port: port,
    path: '/',
    method: 'GET',
  });

  req.end();
  req.on('response', res => {
    res.on('end', () => {
      console.log('Finished request');
    });
    res.resume();
  });
});

// Make sure there is work on the event loop
const handle = setInterval(() => {}, 1);

// Gracefully shut down
process.on('SIGTERM', () => {
  clearInterval(handle);
  server.close();
});
