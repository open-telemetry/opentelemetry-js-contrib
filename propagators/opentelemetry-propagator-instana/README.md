# OpenTelemetry Instana Propagator

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @basti1302, @kirrg001

The OpenTelemetry Propagator for Instana provides HTTP header propagation for systems that are using IBM Observability by Instana.
This propagator translates the Instana trace correlation headers (`X-INSTANA-T/X-INSTANA-S/X-INSTANA-L`) into the OpenTelemetry `SpanContext`, and vice versa.
It does not handle `TraceState`.

This package is compatible with the [OpenTelemetry JS API](https://www.npmjs.com/package/@opentelemetry/api) >= `1.0.0`.

## Installation

```sh
npm install --save @opentelemetry/propagator-instana
```

## Usage

In the [global tracer configuration file](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/#setup), configure the following:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { InstanaPropagator } = require('@opentelemetry/propagator-instana');
// ...

const provider = new NodeTracerProvider();

// Set the global trace context propagator to use X-INSTANA-T/-S/-L trace headers.
provider.register({
  propagator: new InstanaPropagator()
});
```

## Propagator Details

There are three headers that the propagator handles: `X-INSTANA-T` (the trace ID), `X-INSTANA-S` (the parent span ID), and `X-INSTANA-L` (the sampling level).

Example header triplet:

* `X-INSTANA-T: 80f198ee56343ba864fe8b2a57d3eff7`,
* `X-INSTANA-S: e457b5a2e4d86bd1`,
* `X-INSTANA-L: 1`.

A short summary for each of the headers is provided below. More details are available at <https://www.ibm.com/docs/en/obi/current?topic=monitoring-traces#tracing-headers>.

### X-INSTANA-T -- trace ID

* A string of either 16 or 32 characters from the alphabet `0-9a-f`, representing either a 64 bit or 128 bit ID.
* This header corresponds to the [OpenTelemetry TraceId](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/overview.md#spancontext).
* If the propagator receives an X-INSTANA-T header value that is shorter than 32 characters when _extracting_ headers into the OpenTelemetry span context, it will left-pad the string with the character "0" to length 32.
* No length transformation is applied when _injecting_ the span context into headers.

### X-INSTANA-S -- parent span ID

* Format: A string of 16 characters from the alphabet `0-9a-f`, representing a 64 bit ID.
* This header corresponds to the [OpenTelemetry SpanId](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/overview.md#spancontext).

### X-INSTANA-L - sampling level

* The only two valid values are `1` and `0`.
* A level of `1` means that this request is to be sampled, a level of `0` means that the request should not be sampled.
* This header corresponds to the sampling bit of the [OpenTelemetry TraceFlags](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/overview.md#spancontext).

## Useful links

* For more information on Instana, visit <https://www.instana.com/> and [Instana' documentation](https://www.ibm.com/docs/en/obi/current).
* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/propagator-instana
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fpropagator-instana.svg
