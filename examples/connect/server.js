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
  const result = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
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
