#!/usr/bin/env node
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

/**
 * Starts a custom server to provide caching to `nx` in CI
 *
 * See: https://nx.dev/docs/guides/tasks--caching/self-hosted-caching#build-your-own-caching-server
 *
 * Usage:
 *      NX_CACHE_SERVER_PORT=3000 NX_CACHE_SERVER_PATH=my-cache node scripts/nx-cache-server.mjs
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';

const port = process.env.NX_CACHE_SERVER_PORT;
const cachePath = process.env.NX_CACHE_SERVER_PATH;

const server = createServer((req, res) => {
  const url = new URL(`http://localhost}${req.url}`);
  const [version, resource, hash] = url.pathname.split('/').filter(s => s);
  const verb = req.method.toUpperCase();

  // Validation
  // Auth token?

  // Path is correct and contains hash
  if (version !== 'v1' || resource !== 'cache' || typeof hash !== 'string') {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  
  if (verb === 'PUT') {
    return setHash(req, res, hash);
  } else if (verb === 'GET') {
    return getHash(req, res, hash);
  }

  res.writeHead(400, {'Content-Type': 'text/plain'});
  res.end('Invalid method.');
});

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} hash
 */
function setHash(req, res, hash) {
  const contentType = req.headers['content-type'];
  const bodyLength = Number(req.headers['content-length']);
  const invalidLength = isNaN(bodyLength);
  const invalidType = contentType !== 'application/octet-stream';
  if (invalidLength || invalidType) {
    const errMsgs = [];
    if (invalidLength) {
      errMsgs.push('content-lenght must be a number')
    }
    if (invalidType) {
      errMsgs.push('content-type must be application/octet-stream');
    }
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end(`Invalid params: ${errMsgs.join(', ')}.`);
    return;
  }

  // Ensure cache
  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true });
  }

  // Do not override existing hashes?? -- yes for now
  const entryPath = `${cachePath}/${hash}`
  if (existsSync(entryPath)) {
    res.statusCode = 409;
    res.end('Cannot override an existing record.');
    return;
  }

  // Pipe stream to a file
  const writeStream = createWriteStream(entryPath);
  req.pipe(writeStream);
  req.on('end', () => {
    req.statusCode = 200;
    res.end();
  });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} hash
 */
function getHash(req, res, hash) {
  // no cache or no entry -> nothing to return
  const entryPath = `${cachePath}/${hash}`
  if (!existsSync(cachePath) || !existsSync(entryPath)) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Not found.');
    return;
  }

  // Pipe stream to a file
  const readStream = createReadStream(entryPath);
  readStream.pipe(res);
  readStream.on('error', (err) => {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end(`Unkonw error::: ${err}`);
  })
}

console.log(`server listening to port ${port}`);
server.listen(port);