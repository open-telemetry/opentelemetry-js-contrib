'use strict';

// eslint-disable-next-line import/order
import { setupTracing } from "./tracer";
setupTracing('example-mysql-server');
import * as api from '@opentelemetry/api';
import * as mysql from 'mysql'
import * as http from 'http';
import { MysqlError } from "mysql";
import { PoolConnection } from "mysql";

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'secret',
});

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'secret',
});

const cluster = mysql.createPoolCluster();

cluster.add({
  host: 'localhost',
  user: 'root',
  password: 'secret',
});

/** Starts a HTTP server that receives requests on sample server port. */
function startServer(port: number | undefined) {
  // Creates a server
  const server = http.createServer(handleRequest);
  // Starts the server
  server.listen(port, () => {
    console.log(`Node HTTP listening on ${port}`);
  });
}

/** A function which handles requests and send response. */
function handleRequest(request: any, response: any) {
  const currentSpan = api.trace.getSpan(api.context.active())
  // display traceid in the terminal
  const traceId = currentSpan?.spanContext();
  console.log(`traceid: ${traceId}`);
  console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
  console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
  try {
    const body = [];
    request.on('error',
      (err: any) => console.log(err)
    );
    request.on('data',
      (chunk: any) => body.push(chunk)
    );
    request.on('end', () => {
      if (request.url === '/connection/query') {
        handleConnectionQuery(response);
      } else if (request.url === '/pool/query') {
        handlePoolQuery(response);
      } else if (request.url === '/cluster/query') {
        handleClusterQuery(response);
      } else {
        handleNotFound(response);
      }
    });
  } catch (err) {
    console.log(err);
  }
}

startServer(8080);

function handlePoolQuery(response: any) {
  const query = 'SELECT 1 + 1 as pool_solution';
  pool.getConnection((connErr: MysqlError, conn: PoolConnection) => {
    if (connErr) {
      console.log('Error connection: ', connErr.message);
      response.end(connErr.message);
    } else {
      conn.query(query, (err, results) => {
        api.trace.getSpan(api.context.active())?.addEvent('results');
        if (err) {
          console.log('Error code:', err.code);
          response.end(err.message);
        } else {
          response.end(`${query}: ${results[0].pool_solution}`);
        }
      });
    }
  });
}

function handleConnectionQuery(response: any) {
  const query = 'SELECT 1 + 1 as solution';
  connection.query(query, (err, results, _fields) => {
    if (err) {
      console.log('Error code:', err.code);
      response.end(err.message);
    } else {
      response.end(`${query}: ${results[0].solution}`);
    }
  });
}

function handleClusterQuery(response: any) {
  const query = 'SELECT 1 + 1 as cluster_solution';
  cluster.getConnection((connErr, conn) => {
    if (connErr) {
      console.log('Error connection: ', connErr.message);
      response.end(connErr.message);
    } else {
      conn.query(query, (err, results, _fields) => {
        api.trace.getSpan(api.context.active())?.addEvent('results');
        if (err) {
          console.log('Error code:', err.code);
          response.end(err.message);
        } else {
          response.end(`${query}: ${results[0].cluster_solution}`);
        }
      });
    }
  });
}

function handleNotFound(response: any) {
  response.end('not found');
}
