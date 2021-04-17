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

// `setDefaultName` shows up in spans as the name
const setDefaultName = (req, res, next) => {
  req.defaultName = 'Stranger';
  next();
};

server.use([(req, res, next) => {
  /*
    noop to showcase use with an array.
    as this is an anonymous fn, the name is not known and cannot be displayed in traces.
   */
  next();
}, setDefaultName]);

// named function to be used in traces
// eslint-disable-next-line prefer-arrow-callback
server.get('/hello/:name', function hello(req, res, next) {
  console.log('Handling hello');
  res.send(`Hello, ${req.params.name || req.defaultName}\n`);
  return next();
});

server.get('/bye/:name', (req, res, next) => {
  console.log('Handling bye');
  return next(new Error('Ooops in bye'));
});

server.listen(PORT, () => {
  console.log('Ready on %s', server.url);
});
