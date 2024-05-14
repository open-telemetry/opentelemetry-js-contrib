# OpenTelemetry Propagators

## Built-in Propagators

OpenTelemetry core package provides many Built-in Propagators such as W3CTraceContextPropagator Propagator, B3 Propagator, Composite Propagator etc.

[Click here](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core#built-in-propagators) to see Built-in Propagators.

## GRPC Census Propagator

OpenTelemetry gRPC Census propagator provides gRPC header propagation for systems that use the OpenCensus 'grpc-trace-bin' binary header format.

```js
const api = require("@opentelemetry/api");
const { GrpcCensusPropagator } = require("@opentelemetry/propagator-grpc-census-binary");

/- Set Global Propagator */
api.propagation.setGlobalPropagator(new GrpcCensusPropagator());
```

[Click here](opentelemetry-propagator-grpc-census-binary/README.md) for more comprehensive examples.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
