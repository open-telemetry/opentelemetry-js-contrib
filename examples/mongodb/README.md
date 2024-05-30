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

- Start MongoDB server in docker

   ```sh
   # from this directory
   npm run docker:start
   ```

- Run the server

   ```sh
   # from this directory
   npm run zipkin:server
   ```

- Run the client

   ```sh
   # from this directory
   npm run zipkin:client
   ```

#### Zipkin UI

After a short time, the generated traces should be available in the Zipkin UI.
Visit <http://localhost:9411/zipkin> and click the "RUN QUERY" button to view
recent traces, then click "SHOW" on a given trace.

<p align="center"><img alt="Zipkin UI with trace" src="./images/zipkin.png?raw=true"/></p>

### Jaeger

- Start MongoDB server via docker

   ```sh
   # from this directory
   npm run docker:start
   ```

- Run the server

   ```sh
   # from this directory
   npm run jaeger:server
   ```

- Run the client

   ```sh
   # from this directory
   npm run jaeger:client
   ```

#### Jaeger UI

Visit the Jaeger UI at <http://localhost:16686/search>, select a service (e.g. "example-express-client"), click "Find Traces", then click on a trace to view it.

<p align="center"><img alt="Jaeger UI with trace" src="images/jaeger-ui.png?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
