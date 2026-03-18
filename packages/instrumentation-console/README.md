# OpenTelemetry Instrumentation for Node.js Console

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the Node.js [`console`](https://nodejs.org/api/console.html) module, generating OpenTelemetry LogRecords for console method calls (`console.log`, `console.error`, `console.warn`, etc.).

## Installation

```bash
npm install @opentelemetry/instrumentation-console
```

## Supported Versions

- Node.js `^18.19.0 || >=20.6.0`

## Usage

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleInstrumentation } = require('@opentelemetry/instrumentation-console');

const sdk = new NodeSDK({
  instrumentations: [new ConsoleInstrumentation()],
});
sdk.start();

// Now console calls will generate LogRecords
console.log('Hello, world!');    // severity: INFO
console.warn('Watch out!');      // severity: WARN
console.error('Something bad');  // severity: ERROR
```

## Console Methods Instrumented

| Console Method   | Severity Number | Severity Text |
| ---------------- | --------------- | ------------- |
| `console.trace`  | TRACE           | TRACE         |
| `console.debug`  | DEBUG           | DEBUG         |
| `console.log`    | INFO            | INFO          |
| `console.info`   | INFO            | INFO          |
| `console.warn`   | WARN            | WARN          |
| `console.error`  | ERROR           | ERROR         |
| `console.dir`    | INFO            | INFO          |

## Configuration

| Option                  | Type                  | Default | Description                                                        |
| ----------------------- | --------------------- | ------- | ------------------------------------------------------------------ |
| `disableLogSending`     | `boolean`             | `false` | Disable sending log records to the OTel Logs SDK                   |
| `disableLogCorrelation` | `boolean`             | `false` | Disable injecting trace context fields into log record attributes  |
| `logSeverity`           | `SeverityNumber`      | —       | Minimum severity level; only logs at or above this level are sent  |
| `logHook`               | `LogHookFunction`     | —       | Hook to inject additional fields into log records                  |

### logHook Example

```javascript
new ConsoleInstrumentation({
  logHook: (span, record) => {
    record['custom.field'] = 'value';
  },
});
```

## Trace Context Correlation

When a console method is called within an active span context, the resulting LogRecord will automatically include `trace_id`, `span_id`, and `trace_flags` attributes for log correlation.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-console
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-console.svg
