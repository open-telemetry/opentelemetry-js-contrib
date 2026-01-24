'use strict';

// required to initialize the service name for the auto-instrumentation
require('./tracer')('example-client');
// eslint-disable-next-line import/order
const http = require('http');

/** A function which makes requests and handles response. */
function makeRequest(path) {
  // span corresponds to outgoing requests. Here, we have manually created
  // the span, which is created to track work that happens outside of the
  // request lifecycle entirely.
  http.get({
    host: 'localhost',
    headers: {
      accept: 'text/plain',
    },
    port: 8080,
    path,
  }, (response) => {
    response.on('data', (chunk) => console.log(path, '::', chunk.toString('utf8')));
    response.on('end', () => {
      console.log(path, 'status', response.statusCode);
    });
  });

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
  setTimeout(() => { console.log('Completed.'); }, 5000);
}

makeRequest('/hello/world');
// 404
makeRequest('/bye/world');
// error
makeRequest('/err');
