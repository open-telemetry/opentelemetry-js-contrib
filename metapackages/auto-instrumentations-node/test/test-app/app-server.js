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
