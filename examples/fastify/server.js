'use strict';

// eslint-disable-next-line
const tracing = require('./tracing')('example-fastify-server');
const opentelemetry = require('@opentelemetry/api');

const { context, trace } = opentelemetry;
const Fastify = require('fastify');
const axios = require('axios');

const PORT = 8080;
const app = Fastify({ logger: true });
app
  .register(require('fastify-express'))
  .register(subsystem);

async function subsystem(fastify) {
  fastify.addHook('onRequest', async () => {
    const span = trace.getSpan(context.active());
    console.log('first', span);
  });
  // eslint-disable-next-line prefer-arrow-callback
  fastify.addHook('onRequest', async function onRequestHook() {
    const span = trace.getSpan(context.active());
    console.log('second', span);
  });
  fastify.use((req, res, next) => {
    const span = trace.getSpan(context.active());
    console.log('third', span);
    next();
  });
  fastify.post('/run_test2', async (req, res) => {
    const result = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
    const result2 = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
    tracing.log('sending response');
    res.send(`OK ${result.data.version} ${result2.data.version}`);
  });
}

app.post('/run_test', async (req, res) => {
  const result = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
  tracing.log('sending response');
  res.send(`OK ${result.data.version}`);
});

app.listen(PORT);
