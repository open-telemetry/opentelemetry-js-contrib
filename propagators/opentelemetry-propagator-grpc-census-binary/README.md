# OpenTelemetry Propagator gRPC Census
[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

OpenTelemetry gRPC Census propagator provides gRPC header propagation for systems that use the OpenCensus 'grpc-trace-bin' binary header format. This allows for context propagation when either:
* incoming gRPC calls come from services already instrumented using OpenCensus
* outgoing gRPC calls go to services already instrumented using OpenCensus

This propagator works in conjunction with the OpenTelemetry [gRPC plugin](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-plugin-grpc).


Example of usage:
```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { GrpcCensusPropagator } = require("@opentelemetry/propagator-grpc-census-binary");
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();

// Register GrpcCensusPropagator so we can propagate content using
// the 'grpc-trace-bin' header in our incoming/outgoing gRPC calls.
provider.register({
  propagator: new GrpcCensusPropagator()
});

registerInstrumentations({
  instrumentations: [
    {
      plugins: {
        grpc: {
          enabled: true,
          path: '@opentelemetry/plugin-grpc',
        }
      },
    },
  ],
  tracerProvider: provider,
});

```

Also, see [examples/grpc-census-prop](../../examples/grpc-census-prop) for a
worked example that shows when this propagator can be useful.

## Implementation Details
See [binary-format.ts](https://github.com/census-instrumentation/opencensus-node/blob/master/packages/opencensus-propagation-binaryformat/src/binary-format.ts) for equivalent encoding/decoding of the format in OpenCensus. Note: the author of the OpenCensus binary format, [@mayurkale22](https://github.com/mayurkale22), also created BinaryTraceContext.ts in [opentelemetry-core](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core) but that was subsequently removed as part of PR [#804](https://github.com/open-telemetry/opentelemetry-js/pull/804). The implementation of GrpcCensusPropagator in _this_ module uses a version of BinaryTraceContext.ts inspired by Mayur's previous work (with minor modifications e.g. there is no longer a BinaryFormat interface to implement).

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=propagators/opentelemetry-propagator-grpc-census-binary
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=propagators%2Fopentelemetry-propagator-grpc-census-binary
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=propagators/opentelemetry-propagator-grpc-census-binary
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=propagators%2Fopentelemetry-propagator-grpc-census-binary&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/propagator-grpc-census-binary
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fpropagator-grpc-census-binary.svg
