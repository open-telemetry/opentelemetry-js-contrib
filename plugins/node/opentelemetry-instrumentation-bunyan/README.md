# OpenTelemetry instrumentation for bunyan

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation of the [`bunyan`](https://www.npmjs.com/package/bunyan) module to inject trace-context into Bunyan log records and to bridge Bunyan logging to the OpenTelemetry Logging SDK. It may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-bunyan
```

## Supported Versions

- `^1.0.0`

## Usage

```js
const { NodeSDK, tracing, logs, api } = require('@opentelemetry/sdk-node');
const { BunyanInstrumentation } = require('@opentelemetry/instrumentation-bunyan');
const sdk = new NodeSDK({
  spanProcessor: new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter()),
  logRecordProcessor: new logs.SimpleLogRecordProcessor(new logs.ConsoleLogRecordExporter()),
  instrumentations: [
    new BunyanInstrumentation({
      // See below for Bunyan instrumentation options.
    }),
  ]
})

const logger = bunyan.createLogger({name: 'example'});

logger.info('hi');
// 1. Log records will be sent to the SDK-registered log record processor, if any.
//    This is called "bridging".

const tracer = api.getTracer('example');
tracer.startActiveSpan('manual-span', span => {
  logger.info('in a span');
  // 2. Fields identifying the current span will be injected into log records:
  //    {"name":"example",...,"msg":"in a span","trace_id":"d61b4e4af1032e0aae279d12f3ab0159","span_id":"d140da862204f2a2","trace_flags":"01"}
})
```

### Logs Bridge

Creation of a Bunyan Logger will automatically add a [Bunyan stream](https://github.com/trentm/node-bunyan#streams) that sends log records to the OpenTelemetry Logs Bridge API. The OpenTelemetry SDK can be configured to handle those records -- for example, sending them on to an OpenTelemetry collector for log archiving and processing. The example above shows a minimal configuration that emits OpenTelemetry log records to the console for debugging.

If the OpenTelemetry SDK is not configured with a Logger provider, then this added stream will be a no-op.

The logs bridge can be disabled with the `enableLogsBridge: false` option.

### Log injection

Bunyan logger calls in the context of a tracing span will have fields indentifying
the span ([spec](https://opentelemetry.io/docs/specs/otel/compatibility/logging_trace_context/)):

- `trace_id`
- `span_id`
- `trace_flags`

After adding these fields, the optional `logHook` is called to allow injecting additional fields. For example:

```js
  logHook: (span, record) => {
    record['resource.service.name'] = provider.resource.attributes['service.name'];
  }
```

When no span context is active or the span context is invalid, injection is skipped.
Log injection can be disabled with the `enableInjection: false` option.

### Bunyan instrumentation options

| Option             | Type              | Description |
| ------------------ | ----------------- | ----------- |
| `enableLogsBridge` | `boolean`         | Whether [logs bridging](#logs-bridge) is enabled. Default `true`. |
| `enableInjection`  | `boolean`         | Whether [log injection](#log-injection) is enabled. Default `true`. |
| `logHook`          | `LogHookFunction` | An option hook to inject additional context to a log record after span context has been added. This requires `enableInjection` to be true. |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-bunyan
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-bunyan.svg
