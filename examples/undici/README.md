This is a small example app, "app.js", that shows using the
[Undici](https://github.com/nodejs/undici) instrumentation with OpenTelemetry.

# Usage

```bash
npm install
node -r ./telemetry.js app.js
```

# Overview

"telemetry.js" sets up the OpenTelemetry SDK to write OTel tracing spans and
log records to the *console* for simplicity. In a real setup you would
configure exporters to send to remote observability apps for viewing and
analysis.

An example run looks like this:

```bash
$ node -r ./telemetry.js app.js
{
  traceId: '22daea1ed239a0cb7c80d9181ecc7560',
  parentId: 'b8d696439544de46',
  traceState: undefined,
  name: 'HTTP GET',
  id: '9eddb5f9fb35e8f6',
  kind: 2,
  timestamp: 1709568252718000,
  duration: 491199.417,
  attributes: {
    'http.request.method': 'GET',
    'url.full': 'https://example.com/',
    'url.path': '/',
    'url.query': '',
    'url.scheme': 'https',
    'server.address': 'example.com',
    'server.port': 443,
    'user_agent.original': 'undici',
    'network.peer.address': '93.184.216.34',
    'network.peer.port': 443,
    'http.response.status_code': 200,
    'http.response.header.content-length': 648
  },
  status: { code: 0 },
  events: [],
  links: []
}
fetched HTML size 1256
{
  traceId: '22daea1ed239a0cb7c80d9181ecc7560',
  parentId: 'b8d696439544de46',
  traceState: undefined,
  name: 'HTTP GET',
  id: 'ca45235f853cdb68',
  kind: 2,
  timestamp: 1709568253216000,
  duration: 112576.459,
  attributes: {
    'http.request.method': 'GET',
    'url.full': 'https://example.com/',
    'url.path': '/',
    'url.query': '',
    'url.scheme': 'https',
    'server.address': 'example.com',
    'server.port': 443,
    'network.peer.address': '93.184.216.34',
    'network.peer.port': 443,
    'http.response.status_code': 200,
    'http.response.header.content-length': 1256
  },
  status: { code: 0 },
  events: [],
  links: []
}
requested HTML size 1256
{
  traceId: '22daea1ed239a0cb7c80d9181ecc7560',
  parentId: undefined,
  traceState: undefined,
  name: 'manual-span',
  id: 'b8d696439544de46',
  kind: 0,
  timestamp: 1709568252715000,
  duration: 614814.666,
  attributes: {},
  status: { code: 0 },
  events: [],
  links: []
}
```
