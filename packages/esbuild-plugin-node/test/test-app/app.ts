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

import { buildTestSchema } from './graphql/schema';
import fastify from 'fastify';
import { graphql } from './graphql/adapter';
import pino from 'pino';

export const server = fastify({
  logger: pino({}, pino.destination(1)),
  disableRequestLogging: true,
});

server.get('/test', req => {
  req.log.info({ hi: 'there' }, 'Log message from handler');
  return { hi: 'there' };
});
const schema = buildTestSchema();
const sourceList = `
  query {
    books {
      name
    }
  }
`;

server.get('/graphql', async req => {
  await graphql({ schema, source: sourceList });

  return { success: true };
});

server
  .listen({ port: 8080 })
  .then(async () => {
    await Promise.all([
      server
        .inject()
        .get('/test')
        .end()
        .catch(err => {
          throw err;
        }),
      server
        .inject()
        .get('/graphql')
        .end()
        .catch(err => {
          throw err;
        }),
    ]).finally(() => server.close());
  })
  .catch(err => {
    throw err;
  });
