# OpenTelemetry Baggage Span Processor for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

The BaggageSpanProcessor reads entries stored in Baggage from the parent context and adds the [baggage](https://opentelemetry.io/docs/concepts/signals/baggage) entries' keys and
values to the span as attributes on span start.

Add this span processor to a tracer provider.

Keys and values added to Baggage will appear on subsequent child spans for a trace within this service *and* be propagated to external services in accordance with any configured propagation formats configured.
If the external services also have a Baggage span processor, the keys and values will appear in those child spans as well.

⚠ Warning ⚠️

Do not put sensitive information in Baggage.

To repeat: a consequence of adding data to Baggage is that the keys and values will appear in all outgoing HTTP headers from the application.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/baggage-span-processor
```

### Usage

Add to the span processors that copies all baggage entries during configuration:

```javascript
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { ALLOW_ALL_BAGGAGE_KEYS, BaggageSpanProcessor } from '@opentelemetry/baggage-span-processor';

const spanProcessors = [
  new tracing.SimpleSpanProcessor(
    new tracing.ConsoleSpanExporter()),
  new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS)];

const sdk = new NodeSDK({
  serviceName: "example-service",
  spanProcessors
});

sdk.start();
```

Alternatively, you can provide a custom baggage key predicate to select which baggage keys you want to copy.

For example, to only copy baggage entries that start with `my-key`:

```javascript
new BaggageSpanProcessor((baggageKey: string) => key.startsWith('my-key'))
```

For example, to only copy baggage entries that matches the regex `^key.+`:

```javascript
const regex = new RegExp("^key.+")
new BaggageSpanProcessor((baggageKey: string) => regex.test(baggageKey))
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/baggage-span-processor
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fbaggage-span-processor.svg
