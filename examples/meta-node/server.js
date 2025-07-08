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

// eslint-disable-next-line
require('./tracer')('example-meta-node');

// Require in rest of modules
const express = require('express');
const axios = require('axios').default;

// Setup express
const app = express();
const PORT = 8080;

const getCrudController = () => {
  const router = express.Router();
  const resources = [];
  router.get('/', (req, res) => res.send(resources));
  router.post('/', (req, res) => {
    resources.push(req.body);
    return res.status(201).send(req.body);
  });
  return router;
};

const authMiddleware = (req, res, next) => {
  const { authorization } = req.headers;
  if (authorization && authorization.includes('secret_token')) {
    next();
  } else {
    res.sendStatus(401);
  }
};

async function setupRoutes() {
  app.use(express.json());

  app.get('/run_test', async (req, res) => {
    const createdCat = await axios.post(
      `http://localhost:${PORT}/cats`,
      {
        name: 'Tom',
        friends: ['Jerry'],
      },
      {
        headers: {
          Authorization: 'secret_token',
        },
      }
    );

    return res.status(201).send(createdCat.data);
  });
  app.use('/cats', authMiddleware, getCrudController());
}

setupRoutes().then(() => {
  app.listen(PORT);
  console.log(`Listening on http://localhost:${PORT}`);
});
