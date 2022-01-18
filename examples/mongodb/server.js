'use strict';

const api = require('@opentelemetry/api');
// eslint-disable-next-line import/order
require('./tracer')('example-mongodb-http-server');

const { MongoClient } = require('mongodb');
const http = require('http');

const url = 'mongodb://localhost:27017/mydb';
let db;

/** Starts a HTTP server that receives requests on sample server port. */
function startServer(port) {
  // Connect to db
  MongoClient.connect(url, (err, database) => {
    if (err) throw err;
    db = database.db('mydb');
  });
  // Creates a server
  const server = http.createServer(handleRequest);
  // Starts the server
  server.listen(port, (err) => {
    if (err) {
      throw err;
    }
    console.log(`Node HTTP listening on ${port}`);
  });
}

/** A function which handles requests and send response. */
function handleRequest(request, response) {
  const currentSpan = api.trace.getSpan(api.context.active());
  // display traceid in the terminal
  const { traceId } = currentSpan.spanContext();
  console.log(`traceid: ${traceId}`);
  console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
  console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
  try {
    const body = [];
    request.on('error', (err) => console.log(err));
    request.on('data', (chunk) => body.push(chunk));
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

function handleInsertQuery(response) {
  const obj = { name: 'John', age: '20' };
  const collection = db.collection('users');
  collection.insertOne(obj, (err) => {
    if (err) {
      console.log('Error code:', err.code);
      response.end(err.message);
    } else {
      console.log('1 document inserted');
      // find document to test context propagation using callback
      // eslint-disable-next-line prefer-arrow-callback
      collection.findOne({}, function () {
        response.end();
      });
    }
  });
}

function handleGetQuery(response) {
  db.collection('users').find({}, (err) => {
    if (err) {
      console.log('Error code:', err.code);
      response.end(err.message);
    } else {
      console.log('1 document served');
      response.end();
    }
  });
}

function handleCreateCollection(response) {
  db.createCollection('users', (err) => {
    if (err) {
      console.log('Error code:', err.code);
      response.end(err.message);
    } else {
      console.log('1 collection created');
      response.end();
    }
  });
}

function handleNotFound(response) {
  response.end('not found');
}
