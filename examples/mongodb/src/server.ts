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
import * as api from '@opentelemetry/api';

import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import * as mongodb from 'mongodb';
import { Collection } from 'mongodb';
import { setupTracing } from './tracer';
import { accessDB } from './utils';

setupTracing('example-mongodb-server');

const DB_NAME = 'mydb';
const COLLECTION_NAME = 'users';
const URL = `mongodb://localhost:27017/${DB_NAME}`;

let db: mongodb.Db;

/** Starts a HTTP server that receives requests on sample server port. */
function startServer(port: number) {
  // Connect to db
  accessDB(URL, DB_NAME)
    .then(result => {
      db = result;
    })
    .catch((err: Error) => {
      throw err;
    });

  // Creates a server
  const server = http.createServer(handleRequest);
  // Starts the server
  server.listen(port, () => {
    console.log(`Node HTTP listening on ${port}`);
  });
}

/** A function which handles requests and send response. */
function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const currentSpan = api.trace.getSpan(api.context.active());
  if (currentSpan) {
    // display traceID in the terminal
    const { traceId } = currentSpan.spanContext();
    console.log(`traceid: ${traceId}`);
    console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
    console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
  } else {
    console.log('No active span found');
  }

  try {
    const body = [];
    request.on('error', err => console.log(err));
    request.on('data', chunk => body.push(chunk));
    request.on('end', async () => {
      if (request.url === '/collection/') {
        handleCreateCollection(response);
      } else if (request.url === '/insert/') {
        handleInsertQuery(response);
      } else if (request.url === '/get/') {
        handleGetQuery(response);
      } else {
        handleNotFound(response);
      }
    });
  } catch (err) {
    console.log(err);
  }
}

startServer(8080);

function handleInsertQuery(response: ServerResponse) {
  const obj = { name: 'John', age: '20' };
  const usersCollection: Collection = db.collection(COLLECTION_NAME);
  usersCollection
    .insertOne(obj)
    .then(() => {
      console.log('1 document inserted');
      // find document to test context
      usersCollection
        .findOne({})
        .then(res => {
          console.log(JSON.stringify(res));
        })
        .catch(err => console.log(err));
    })
    .catch(err => {
      console.log('Error code:', err.code);
      response.end(err.message);
    });
}

function handleGetQuery(response: ServerResponse) {
  const usersCollection: Collection = db.collection(COLLECTION_NAME);
  usersCollection
    .find({})
    .toArray()
    .then(() => {
      console.log('1 document served');
      response.end();
    })
    .catch(err => {
      throw err;
    });
}

function handleCreateCollection(response: ServerResponse) {
  db.createCollection(COLLECTION_NAME)
    .then(() => {
      console.log('1 collection created');
      response.end();
    })
    .catch(err => {
      console.log('Error code:', err.code);
      response.end(err.message);
    });
}

function handleNotFound(response: ServerResponse) {
  response.end('not found');
}
