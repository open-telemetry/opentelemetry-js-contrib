# OpenTelemetry Web Exception Instrumentation

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @martinkuba @wolfgangcodes @pkanal

This module provides automatic instrumentation for capturing unhandled exceptions and promise rejections in web applications.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-web-exception
```

## Usage

```typescript
import { LoggerProvider, SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { logs } from '@opentelemetry/api';
import { ExceptionInstrumentation } from '@opentelemetry/instrumentation-web-exception';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

// Set up the logger provider with a processor
const loggerProvider = new LoggerProvider({
  processors: [
    new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })
  ]
});
logs.setGlobalLoggerProvider(loggerProvider);

// Register the instrumentation
registerInstrumentations({
  instrumentations: [
    new ExceptionInstrumentation({
      // Optional: customize attributes added to error events
      applyCustomAttributes: (error) => ({
        'app.error.severity': error?.name === 'ValidationError' ? 'warning' : 'error',
        'custom.correlation.id': window.correlationId,
      }),
    }),
  ],
});
```

## Configuration

The instrumentation can be configured with the following options:

| Option | Type | Description |
| ------- | ---- | ----------- |
| `enabled` | `boolean` | Whether to enable the instrumentation. Default: `true` |
| `applyCustomAttributes` | `(error: Error \| string) => Attributes` | Optional callback to add custom attributes to error events |

## Features

- Automatically captures unhandled exceptions
- Captures unhandled promise rejections
- Records error name, message, and stack trace using OpenTelemetry semantic conventions
- Supports custom attributes through configuration
- Integrates with OpenTelemetry Logs API

## Semantic Attributes

The following semantic attributes are added to each error event:

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `exception.type` | string | The error name or type |
| `exception.message` | string | The error message |
| `exception.stacktrace` | string | The error stack trace |

When the thrown value is a string, only `exception.message` is set.

Error events whose error is `null` or `undefined`, such as cross-origin script errors (`Script error.`), the `ResizeObserver` loop error and `throw null`, and unhandled rejections with a `null` or `undefined` reason are not reported.

> **Note:** `ErrorsInstrumentation` in [`@opentelemetry/browser-instrumentation`](https://github.com/open-telemetry/opentelemetry-browser/tree/main/packages/instrumentation) handles these differently. It reports an error event that has no error object but does have a message (such as `Script error.` or the `ResizeObserver` loop error) with only `exception.message`, set from the event's message. Expect these extra records after migrating.

## Example

```typescript
// Initialize the instrumentation
const exceptionInstrumentation = new ExceptionInstrumentation({
  applyCustomAttributes: (error) => ({
    'error.category': error instanceof TypeError ? 'type_error' : 'runtime_error',
    'app.version': '1.0.0',
  }),
});

// The instrumentation will automatically capture unhandled errors
throw new Error('Unhandled error');

// And unhandled promise rejections
Promise.reject(new Error('Unhandled rejection'));
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-web-exception
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-web-exception.svg
