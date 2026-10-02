# Overview

This is a simple example that demonstrates tracing of the `redis` package.

- [lib/server.cjs](./lib/server.cjs) is an Express-based HTTP server that exposes Redis commands.
- [lib/client.cjs](./lib/client.cjs) calls the HTTP service to *set* a value in Redis, and then *get* it back.
- [telemetry.mjs](./telemetry.mjs) sets up an OpenTelemetry SDK with instrumentations for modules used in this example.

## Running the example

Install dependencies:

```sh
git clone https://github.com/open-telemetry/opentelemetry-js-contrib.git
cd opentelemetry-js-contrib/examples/redis
npm install
```

Start Redis; and a [Jaeger](https://www.jaegertracing.io/) server for collecting and visually tracing data. (Note: Any backend for visualizing observability data will do, as long as it supports ingesting OTLP. This example just happens to use Jaeger.)

```sh
npm run docker:up   # see docker-compose.yml
```

Run the server:

```sh
npm run server
```

Run the client:

```sh
npm run client
```

Visit the Jaeger UI at <http://localhost:16686/search>, select a service (e.g. "example-redis-client"), click "Find Traces", then click on a trace to view it.

<p align="center"><img alt="Jaeger UI with trace" src="images/jaeger.png?raw=true"/></p>


## Clean up

Cleanup docker when done:

```sh
npm run docker:down
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-sdk-node>

## LICENSE

Apache License 2.0
