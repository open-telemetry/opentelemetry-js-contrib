'use strict';

/* eslint-disable */

const api = require('@opentelemetry/api');
const http = require('http');

const { diag, DiagConsoleLogger, DiagLogLevel } = api;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

// eslint-disable-next-line import/order
const tracer = require('./tracer')('example-http-server');
// eslint-disable-next-line import/order
const restify = require('restify');

const server = restify.createServer();

server.use((req, res, next) => {
  const ctx = api.context.active();
  const span = api.getSpan(ctx);
  console.log('USER', 'mw', span.name, span.attributes, span?.instrumentationLibrary?.name);
  next();
});

server.get('/hello/:name', (req, res, next) => {
	console.log('USER', 'handling hello');
	res.send(`Hello, ${req.params.name}\n`);
	return next();
});


server.get('/bye/:name', (req, res, next) => {
  console.log('USER', 'handling hello 2');
  // cannot execute the operation on ended Span
  res.send(`Bye, ${req.params.name}\n`);
  throw new Error('errroror');
});

let port;
server.listen(0, () => {
	port = server.address().port;
  console.log('USER', 'ready on %s', server.url);
});

setTimeout(() => {
  http.get({
  	hostname: 'localhost',
  	headers: {
  		accept: 'text/plain',
  	},
  	port,
  	path: '/hello/name'
  }, (res) => {
  	res.on('data', (data) => console.log('USER', '::', data.toString()));
  });

  http.get({
    hostname: 'localhost',
    headers: {
      accept: 'text/plain',
    },
    port,
    path: '/bye/name'
  }, (res) => {
    res.on('data', (data) => console.log('USER', '::', data.toString()));
  });
}, 100);

