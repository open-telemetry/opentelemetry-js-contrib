# OpenTelemetry Propagators

  - [Built-in Propagators](#built-in-propagators)
  - [Jaeger Propagator](#jaeger-propagator)
  - [B3 Propagator](#b3-propagator)


### Built-in Propagators

OpenTelemetry core package provides many Built-in Propagators such as HttpTraceContext Propagator, B3 Propagator, Composite Propagator etc.

[Click here](https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-core#built-in-propagators) to see Built-in Propagators.


### Jaeger Propagator

OpenTelemetry Jaeger propagator provides HTTP header propagation for systems that are using Jaeger HTTP header format.

```js
const api = require("@opentelemetry/api");
const { JaegerHttpTracePropagator } = require('@opentelemetry/propagator-jaeger');

/* Set Global Propagator */
api.propagation.setGlobalPropagator(new JaegerHttpTracePropagator());
```

[Click here](opentelemetry-propagator-jaeger/README.md) for more comprehensive examples.

### GRPC Census Propagator

OpenTelemetry gRPC Census propagator provides gRPC header propagation for systems that use the OpenCensus 'grpc-trace-bin' binary header format.

```js
const api = require("@opentelemetry/api");
const { GrpcCensusPropagator } = require("@opentelemetry/propagator-grpc-census-binary");

/* Set Global Propagator */
api.propagation.setGlobalPropagator(new GrpcCensusPropagator());
```

[Click here](opentelemetry-propagator-grpc-census-binary/README.md) for more comprehensive examples.


## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

Apache 2.0 - See [LICENSE][license-url] for more information.
