'use strict';

// eslint-disable-next-line
const api = require('@opentelemetry/api');
const tracer = api.trace.getTracer('fastify-server');
const Fastify = require('fastify');
const axios = require('axios');

const PORT = 8080;
const app = Fastify({ logger: true });
app
  .register(require('@fastify/express'))
  .register(subsystem);

async function subsystem(fastify) {
  fastify.addHook('onRequest', async () => {
    const span = api.trace.getSpan(api.context.active());
    span.setAttribute('order', 2);
  });

  // eslint-disable-next-line prefer-arrow-callback
  fastify.addHook('onRequest', async function onRequestHook() {
    const span = api.trace.getSpan(api.context.active());
    span.setAttribute('order', 3);

    const newSpan = tracer.startSpan('foo');
    newSpan.setAttribute('foo', 'bar');
    newSpan.end();
  });

  fastify.use((req, res, next) => {
    const span = api.trace.getSpan(api.context.active());
    span.setAttribute('order', 1);
    next();
  });

  fastify.post('/run_test2/:id', async (req, res) => {
    const span = api.trace.getSpan(api.context.active());
    span.setAttribute('order', 4);

    const result = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
    const result2 = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');

    console.log('sending response');
    // throw Error('boom  lala');
    res.send(`OK ${result.data.version} ${result2.data.version}`);
  });

  fastify.addHook('onRequest', (req, reply, done) => {
    const span = api.trace.getSpan(api.context.active());
    console.log('first', span);
    console.log('kuku1');
    span.setAttribute('kuku1', 'lala');

    setTimeout(() => {
      console.log('kuku2');
      span.setAttribute('kuku2', 'lala');
      const newSpan = api.trace.tracer.startSpan('tada');
      newSpan.end();

      reply.send('foo');
      done();
    }, 2000);
  });
}

app.post('/run_test/:id', async (req, res) => {
  const result = await axios.get('https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json');
  console.log('sending response');
  res.send(`OK ${result.data.version}`);
});

app.listen({
  port: PORT,
});
