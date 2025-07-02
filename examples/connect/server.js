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

'use strict';

// eslint-disable-next-line
const tracing = require('./tracing')('example-connect-server');

// Require in rest of modules
const connect = require('connect');
const axios = require('axios');

// Setup connect
const app = connect();
const PORT = 8080;

// eslint-disable-next-line prefer-arrow-callback
app.use(function middleware1(req, res, next) {
  next();
});

app.use((req, res, next) => {
  next();
});

app.use('/run_test', async (req, res) => {
  const result = await axios.get(
    'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json'
  );
  tracing.log('sending response');
  res.end(`OK ${result.data.version}`);

  // toggle enabling disabling for easier observing whether the spans are exported or not
  if (tracing.connectInstrumentation.isEnabled()) {
    tracing.log('disabling connect');
    tracing.connectInstrumentation.disable();
  } else {
    tracing.log('enabling connect');
    tracing.connectInstrumentation.enable();
  }
});

app.listen(PORT);
