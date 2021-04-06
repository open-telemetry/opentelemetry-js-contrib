'use strict';

const api = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = api;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

const restify = require('restify');
require('./tracer')('example-restify-server');

const server = restify.createServer();
const PORT = 8080;

server.pre((req, res, next) => {
  next();
});

server.use([(req, res, next) => {
  // noop to showcase use with an array
  next();
}, (req, res, next) => {
  req.defaultName = 'Stranger';
  next();
}]);

server.get('/hello/:name', (req, res, next) => {
  console.log('Handling hello');
  res.send(`Hello, ${req.params.name || req.defaultName}\n`);
  return next();
});

server.get('/bye/:name', () => {
  console.log('Handling bye');
  throw new Error('Ooops in bye');
});

server.listen(PORT, () => {
  console.log('Ready on %s', server.url);
});
