/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

require('./tracer')('example-router-server');

// `setDefaultName` shows up in spans as the name
const setDefaultName = (req, res, next) => {
  req.defaultName = 'Stranger';
  next();
};

const http = require('http');
const Router = require('router');

const router = Router();

router.use(setDefaultName);

router.param('name', (req, res, next, name) => {
  req.params.name =
    typeof name === 'string' ? name.toUpperCase() : req.defaultName;
  next();
});

router.get('/hello/:name', function greetingHandler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(`Hello, ${req.params.name}!`);
});

router.get('/err', function erroringRoute(req, res, next) {
  next(new Error('Broken!'));
});

const server = http.createServer(function (req, res) {
  router(req, res, error => {
    if (error) {
      res.statusCode = 500;
    } else {
      res.statusCode = 404;
    }
    res.end();
  });
});

server.listen(8080);
