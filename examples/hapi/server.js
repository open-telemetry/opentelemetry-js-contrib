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

const api = require('@opentelemetry/api');
require('./tracer')('example-hapi-server');

const Hapi = require('@hapi/hapi');

const PORT = 8081;
const server = Hapi.server({
  port: PORT,
  host: 'localhost',
});

const BlogPostPlugin = {
  name: 'blog-post-plugin',
  version: '1.0.0',
  async register(serverClone) {
    console.log('Registering basic hapi plugin');

    serverClone.route([
      {
        method: 'GET',
        path: '/post/new',
        handler: addPost,
      },
      {
        method: 'GET',
        path: '/post/{id}',
        handler: showNewPost,
      },
    ]);
  },
};

async function setUp() {
  await server.register({ plugin: BlogPostPlugin });

  server.route({
    method: 'GET',
    path: '/run_test',
    handler: runTest,
  });

  server.ext('onRequest', async (request, h) => {
    console.log('No-op Hapi lifecycle extension method');
    const syntheticDelay = 50;
    await new Promise(r => {
      setTimeout(r, syntheticDelay);
    });
    return h.continue;
  });

  await server.start();
  console.log('Server running on %s', server.info.uri);
  console.log(`Listening on http://localhost:${PORT}`);
}

/**
 *  Blog Post functions: list, add, or show posts
 */
const posts = ['post 0', 'post 1', 'post 2'];

function addPost(_, h) {
  posts.push(`post ${posts.length}`);
  const currentSpan = api.trace.getSpan(api.context.active());
  currentSpan.addEvent('Added post');
  currentSpan.setAttribute('Date', new Date());
  console.log(`Added post: ${posts[posts.length - 1]}`);
  return h.redirect('/post/3');
}

async function showNewPost(request) {
  const { id } = request.params;
  console.log(`showNewPost with id: ${id}`);
  const post = posts[id];
  if (!post) throw new Error('Invalid post id');
  const syntheticDelay = 200;
  await new Promise(r => {
    setTimeout(r, syntheticDelay);
  });
  return post;
}

function runTest(_, h) {
  const currentSpan = api.trace.getSpan(api.context.active());
  const { traceId } = currentSpan.spanContext();
  console.log(`traceid: ${traceId}`);
  console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
  console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
  return h.redirect('/post/new');
}

setUp();
process.on('unhandledRejection', err => {
  console.log(err);
  process.exit(1);
});
