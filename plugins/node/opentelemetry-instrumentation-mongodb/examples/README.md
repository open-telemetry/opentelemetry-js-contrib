# Overview

OpenTelemetry Mongodb Instrumentation allows the user to automatically collect trace data and export them to the backend of choice (we can use Zipkin or Jaeger for this example), to give observability to distributed systems.

This is a modification of the Mongo example that executes multiple parallel requests that interact with a Mongodb server backend using the `mongo` npm module. The example displays traces using multiple connection methods.

- Create Collection Query
- Insert Document Query
- Fetch All Documents Query

## Installation

```sh
# from this directory
npm install
```

Setup [Zipkin Tracing](https://zipkin.io/pages/quickstart.html)
or
Setup [Jaeger Tracing](https://www.jaegertracing.io/docs/latest/getting-started/#all-in-one)

## Run the Application

### Zipkin

- Run the server

   ```sh
   # from this directory
   npm run server
   ```

- Run the client

   ```sh
   # from this directory
   npm run client
   ```

#### Zipkin UI

`server` script should output the `traceid` in the terminal (e.g `traceid: 4815c3d576d930189725f1f1d1bdfcc6`).
Go to Zipkin with your browser <http://localhost:9411/zipkin/traces/(your-trace-id)> (e.g <http://localhost:9411/zipkin/traces/4815c3d576d930189725f1f1d1bdfcc6>)

<p align="center"><img src="./images/zipkin-ui.png?raw=true"/></p>

### Jaeger

- Run the server

   ```sh
   # from this directory
   npm run server
   ```

- Run the client

   ```sh
   # from this directory
   npm run client
   ```

#### Jaeger UI

`server` script should output the `traceid` in the terminal (e.g `traceid: 4815c3d576d930189725f1f1d1bdfcc6`).
Go to Jaeger with your browser <http://localhost:16686/trace/(your-trace-id)> (e.g <http://localhost:16686/trace/4815c3d576d930189725f1f1d1bdfcc6>)

<p align="center"><img src="images/jaeger-ui.png?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
