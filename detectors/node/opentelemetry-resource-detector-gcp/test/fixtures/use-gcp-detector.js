const { createTestNodeSdk } = require ('@opentelemetry/contrib-test-utils');
const { HttpInstrumentation } = require ('@opentelemetry/instrumentation-http');
const { gcpDetector } = require ('../../build/src/index.js');


const sdk = createTestNodeSdk({
  serviceName: 'use-detector-gcp',
  instrumentations: [
    new HttpInstrumentation(),
  ],
  resourceDetectors: [gcpDetector],
}); 

sdk.start();

const http = require('http');

const server = http.createServer((req,res) => {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);
  
  req.resume();
  req.on('end', function () {
    const body = 'pong';
    res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': body.length,
    });
    res.end(body);
  });
});

server.listen(0, '127.0.0.1', async function () {
  const port = server.address().port;

  // First request to show a client error.
  const startTime = Date.now();
  await new Promise((resolve) => {
      const clientReq = http.request(
          `http://127.0.0.1:${port}/ping`,
          function (cres) {
              console.log(
                  'client response: %s %s',
                  cres.statusCode,
                  cres.headers
              );
              const chunks = [];
              cres.on('data', function (chunk) {
                  chunks.push(chunk);
              });
              cres.on('end', function () {
                  const body = chunks.join('');
                  console.log('client response body: %j', body);
                  resolve();
              });
          }
      );
      clientReq.write('ping');
      clientReq.end();
  });

  // flush any left spans
  await sdk.shutdown();
  await new Promise(resolve => server.close(resolve));
});
