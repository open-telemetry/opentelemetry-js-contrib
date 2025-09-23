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
