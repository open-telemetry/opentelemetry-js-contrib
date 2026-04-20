/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
