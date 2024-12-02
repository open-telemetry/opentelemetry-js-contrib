# Overview

OpenTelemetry Express Instrumentation allows the user to automatically collect trace data and export them to the backend of choice (we use Jaeger for this example), to give observability to distributed systems.

This is a simple example that demonstrates tracing calls made to Express API. The example
shows key aspects of tracing such as

- Root Span (on Client)
- Child Span (on Client)
- Span Events
- Span Attributes

## Installation

```sh
# from this directory
npm install
```

Start Jaeger in Docker for receiving tracing data (see [the Jaeger docs](https://www.jaegertracing.io/docs/2.0/getting-started/#in-docker) for more details about running Jaeger):

```bash
docker run --rm --name jaeger \
  -p 5778:5778 \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 14250:14250 \
  -p 14268:14268 \
  -p 9411:9411 \
  jaegertracing/jaeger:2.0.0 \
  --set receivers.otlp.protocols.http.endpoint=0.0.0.0:4318 \
  --set receivers.otlp.protocols.grpc.endpoint=0.0.0.0:4317
```

## Run the Application

Run the server:

```sh
npm run server
```

Then run the client in a separate terminal:

```sh
npm run client
```

Visit the Jaeger UI at <http://localhost:16686/search>, select a service (e.g. "example-express-client"), click "Find Traces", then click on a trace to view it.

<p align="center"><img alt="Jaeger UI with trace" src="images/jaeger.jpg?raw=true"/></p>

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
