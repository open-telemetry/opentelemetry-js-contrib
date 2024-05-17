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

import { context, trace, Span, Tracer } from '@opentelemetry/api';
import { setRPCMetadata, RPCType } from '@opentelemetry/core';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as express from 'express';

export const httpRequest = {
  get: (options: http.ClientRequestArgs | string) => {
    return new Promise((resolve, reject) => {
      return http.get(options, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          resolve(data);
        });
        resp.on('error', err => {
          reject(err);
        });
      });
    });
  },
};

export async function createServer(app: express.Express) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

export async function serverWithMiddleware(
  tracer: Tracer,
  rootSpan: Span,
  addMiddlewares: (app: express.Express) => void
) {
  const app = express();
  if (tracer) {
    app.use((req, res, next) => {
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      return context.with(
        setRPCMetadata(trace.setSpan(context.active(), rootSpan), rpcMetadata),
        next
      );
    });
  }

  addMiddlewares(app);

  const router = express.Router();
  app.use('/toto', router);
  app.use('/double-slashes/', router);
  router.get('/:id', (req, res) => {
    setImmediate(() => {
      res.status(200).end(req.params.id);
    });
  });

  return createServer(app);
}
