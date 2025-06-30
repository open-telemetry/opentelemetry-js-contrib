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

// Require in rest of modules
import * as express from 'express';
import * as axios from 'axios';
import { randomBytes } from 'crypto';
// eslint-disable-next-line import/extensions
import { setupTracing } from './tracer';
// eslint-disable-next-line import/extensions
import * as tracerHandlers from './express-tracer-handlers';

const tracer = setupTracing('example-redis-server');
// eslint-disable-next-line import/extensions
const { redisPromise } = require('./setup-redis');

// Setup express
const app = express();
const PORT = 8080;

/**
 * Redis Routes are set up async since we resolve the client once it is successfully connected
 */
async function setupRoutes() {
  const redis = await redisPromise;

  app.get('/run_test', async (req: express.Request, res: express.Response) => {
    const uuid = randomBytes(16).toString('hex');
    await axios.get(`http://localhost:${PORT}/set?args=uuid,${uuid}`);
    const body = await axios.get(`http://localhost:${PORT}/get?args=uuid`);

    if (body.data !== uuid) {
      throw new Error('UUID did not match!');
    } else {
      res.sendStatus(200);
    }
  });

  app.get('/:cmd', (req: any, res: any) => {
    if (!req.query.args) {
      res.status(400).send('No args provided');
      return;
    }

    const { cmd } = req.params;
    const args = req.query.args.split(',');
    redis[cmd].call(redis, ...args, (err: any, result: any) => {
      if (err) {
        res.sendStatus(400);
      } else if (result) {
        res.status(200).send(result);
      } else {
        throw new Error('Empty redis response');
      }
    });
  });
}

// Setup express routes & middleware
app.use(tracerHandlers.getMiddlewareTracer(tracer));
setupRoutes()
  .then(() => {
    app.use(tracerHandlers.getErrorTracer(tracer));
    app.listen(PORT);
    console.log(`Listening on http://localhost:${PORT}`);
  })
  .catch(err => console.log(err));
