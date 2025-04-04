# Overview

OpenTelemetry MySQL Instrumentation allows the user to automatically collect trace data and metrics and export them to the backend of choice (we can use Zipkin or Grafana for this example), to give observability to distributed systems.

This is a modification of the HTTP example that executes multiple parallel requests that interact with a MySQL server backend using the `mysql` npm module. The example displays traces using multiple connection methods.

- Direct Connection Query
- Pool Connection Query
- Cluster Pool Connection Query

## supported metrics

- Currently only `db.client.connections.usage` is supported, which denotes the number of idle/used connections.

## Installation

```sh
# from this directory
npm install
```

Setup [Zipkin Tracing](https://zipkin.io/pages/quickstart.html)

In case you want to see also metrics:

1. Go to `docker` folder
2. Run `docker compose up`. This will set up Zipkin, otel collector, Prometheus and Grafana.
3. To see your metrics, go to `http://localhost:3000/`.

## Run the Application

### Zipkin

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

The `zipkin:server` script should output the `traceid` in the terminal (e.g `traceid: 4815c3d576d930189725f1f1d1bdfcc6`).
Go to Zipkin with your browser <http://localhost:9411/zipkin/traces/(your-trace-id)> (e.g <http://localhost:9411/zipkin/traces/4815c3d576d930189725f1f1d1bdfcc6>)

<p align="center"><img alt="Zipkin UI with trace" src="./images/zipkin-ui.png?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
