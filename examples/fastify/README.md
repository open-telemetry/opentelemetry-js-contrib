# Overview

OpenTelemetry Fastify Instrumentation allows the user to automatically collect trace data and export them to the backend of choice (Collector Exporter), to give observability to distributed systems.

This is a simple example that demonstrates tracing calls made to Fastify API. The example shows key aspects of tracing such as

- Root Span (on Client)
- Child Span (on Client)
- Span Events
- Span Attributes

## Installation

```sh
# from this directory
npm install
```

## Run the Application

### Collector - docker container

- Run docker container with collector

   ```sh
   # from this directory
   $ npm run docker:start
   ```

Note: If you are happen to run the example on a Apple Silicon system, you might
get an error similar to `no matching manifest for Linux/arm64/v8 in the manifest list entries`
in that case you can resolve this error by adding `platform: linux/amd64` to each service in `docker/docker-compose.yaml`.

### Server

- Run the server

   ```sh
   # from this directory
   $ npm run server
   ```

- Run the client

   ```sh
   # from this directory
   npm run client
   ```

#### Zipkin UI

Go to Zipkin with your browser <http://localhost:9411/>

<p align="center"><img src="images/trace1.png?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
