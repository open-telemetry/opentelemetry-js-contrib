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
import { logs } from '@opentelemetry/api-logs';
import { ExceptionInstrumentation } from '@opentelemetry/instrumentation-web-exception';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

// Set up the logger provider with a processor
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())]
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
