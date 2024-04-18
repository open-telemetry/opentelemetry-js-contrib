# OpenTelemetry Host Metrics for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

The BaggageSpanProcessor reads entries stored in Baggage from the parent context and adds the baggage entries' keys and
values to the span as attributes on span start.

Add this span processor to a tracer provider.

Keys and values added to Baggage will appear on subsequent child spans for a trace within this service *and* be propagated to external services in accordance with any configured propagation formatsconfigured.
If the external services also have a Baggage span processor, the keys and values will appear in those child spans as well.

⚠ Warning ⚠️

Do not put sensitive information in Baggage.

To repeat: a consequence of adding data to Baggage is that the keys and values will appear in all outgoing HTTP headers from the application.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/baggage-span-processor
```

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/host-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fhost-metrics.svg
