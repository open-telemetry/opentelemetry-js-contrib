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

import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildTestSchema } from './graphql/schema';
import { createClient } from 'redis';
import fastify from 'fastify';
import { graphql } from './graphql/adapter';
import pino from 'pino';

const redisClient = createClient({ url: process.env.REDIS_URL });

export const server = fastify({
  logger: pino({}, pino.destination(1)),
  disableRequestLogging: true,
}).register(require('@fastify/rate-limit'), {
  // Use @fastify/rate-limit to avoid CodeQL "Missing rate limiting" error in CI
  global: true,
  max: 100,
  timeWindow: '1 minute',
});

server.get('/test', async req => {
  req.log.info({ hi: 'there' }, 'Log message from handler');

  await redisClient.get('key').catch(() => void 0);

  try {
    const mongoDbUri = (req.query as any)?.mongoDbUri;
    if (!mongoDbUri) throw new Error('Missing mongoDbUri query param');
    const mongoClient = new MongoClient(mongoDbUri);
    const db = mongoClient.db('sample-database');
    const col = db.collection('sample-collection');
    await col.findOne({ hello: 'test' });
    await mongoClient.close();
  } catch (e) {
    req.log.info(e, 'Error connecting to MongoDB');
  }

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
    const mongod = await MongoMemoryServer.create();
    const mongoDbUri = mongod.getUri();
    try {
      await server
        .inject()
        .get('/test')
        .query({ mongoDbUri })
        .end()
        .catch(err => {
          throw err;
        });
      await server
        .inject()
        .get('/graphql')
        .end()
        .catch(err => {
          throw err;
        });
    } finally {
      await Promise.all([server.close(), mongod.stop()]).catch(() => void 0);
    }
  })
  .catch(err => {
    throw err;
  });
