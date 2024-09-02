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

const options = {
  hostname: 'example.com',
  port: 80,
  path: '/',
  method: 'GET',
};

const req = http.request(options);
req.end();
req.on('close', () => {
  console.log('Finshed request');
});

// Make sure there is work on the event loop
const handle = setInterval(() => {}, 1);
// Gracefully shut down
process.on('SIGTERM', () => {
  clearInterval(handle);
});
