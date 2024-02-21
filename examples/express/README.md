# Overview

OpenTelemetry Express Instrumentation allows the user to automatically collect trace data and export them to the backend of choice (we can use Zipkin or Jaeger for this example), to give observability to distributed systems.

This is a simple example that demonstrates tracing calls made to Express API. The example
shows key aspects of tracing such as

- Root Span (on Client)
- Child Span (on Client)
- Span Events
- Span Attributes

## Installation

```sh
npm install
```

Setup [Zipkin Tracing](https://zipkin.io/pages/quickstart.html)
or
Setup [Jaeger Tracing](https://www.jaegertracing.io/docs/latest/getting-started/#all-in-one)

## Run the Application

### Zipkin

Run the server:

```sh
npm run zipkin:server
```

Then run the client in a separate terminal:

```sh
npm run zipkin:client
```

After a short time, the generated traces should be available in the Zipkin UI.
Visit <http://localhost:9411/zipkin> and click the "RUN QUERY" button to view
recent traces, then click "SHOW" on a given trace.

<p align="center"><img src="./images/zipkin.jpg?raw=true"/></p>

### Jaeger

Run the server:

```sh
npm run jaeger:server
```

Then run the client in a separate terminal:

```sh
npm run jaeger:client
```

Visit the Jaeger UI at <http://localhost:16686/search>, select a service (e.g. "example-express-client"), click "Find Traces", then click on a trace to view it.

<p align="center"><img src="images/jaeger.jpg?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
