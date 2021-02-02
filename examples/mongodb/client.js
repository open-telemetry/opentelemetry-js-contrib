'use strict';

const api = require('@opentelemetry/api');
const tracer = require('./tracer')('example-mongodb-http-client');
// eslint-disable-next-line import/order
const http = require('http');

/** A function which makes requests and handles response. */
function makeRequest() {
  // span corresponds to outgoing requests. Here, we have manually created
  // the span, which is created to track work that happens outside of the
  // request lifecycle entirely.
  const span = tracer.startSpan('makeRequest');

  let queries = 0;
  let responses = 0;

  api.context.with(api.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get({
      host: 'localhost',
      port: 8080,
      path: '/collection/',
    }, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => {
        responses += 1;
        console.log(body.toString());
        if (responses === queries) span.end();
      });
    });
  });
  api.context.with(api.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get({
      host: 'localhost',
      port: 8080,
      path: '/insert/',
    }, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => {
        responses += 1;
        console.log(body.toString());
        if (responses === queries) span.end();
      });
    });
  });
  api.context.with(api.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get({
      host: 'localhost',
      port: 8080,
      path: '/get/',
    }, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => {
        responses += 1;
        console.log(body.toString());
        if (responses === queries) span.end();
      });
    });
  });

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
  setTimeout(() => { console.log('Completed.'); }, 5000);
}

makeRequest();
