# Overview

OpenTelemetry Restify Instrumentation allows the user to automatically collect trace data and export them to the backend of choice (we can use Zipkin or Jaeger for this example). This example demonstrates tracing calls made to Restify API. All generated spans include following attributes:

- `http.route`: resolved route;
- `restify.method`: server method used to register the handler. One of `use`, `pre`, `del`, `get`, `head`, `opts`, `post`, `put` or `patch`;
- `restify.type`: either `middleware` or `request_handler`;
- `restify.version`: `restify` version running.

## Setup

Setup [Zipkin Tracing](https://zipkin.io/pages/quickstart.html)
or
Setup [Jaeger Tracing](https://www.jaegertracing.io/docs/latest/getting-started/#all-in-one)

## Run the Application

First install the dependencies:

```sh
npm install
```

### Zipkin

```sh
npm run zipkin:server # Run the server
npm run zipkin:client # Run the client in a separate terminal
```

### Jaeger

```sh
npm run jaeger:server # Run the server
npm run jaeger:client # Run the client in a separate terminal
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node>

## LICENSE

Apache License 2.0
