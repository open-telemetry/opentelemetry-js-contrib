# OpenTelemetry instrumentation for winston

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation of the [`winston`](https://www.npmjs.com/package/winston) module to inject trace-context into Winston log records (log correlation) and to send Winston logging to the OpenTelemetry Logging SDK (log sending). It may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-winston
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const logsAPI = require('@opentelemetry/api-logs');
const {
    LoggerProvider,
    SimpleLogRecordProcessor,
    ConsoleLogRecordExporter,
} = require('@opentelemetry/sdk-logs');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const tracerProvider = new NodeTracerProvider();
tracerProvider.register();

// To start a logger, you first need to initialize the Logger provider.
const loggerProvider = new LoggerProvider();
// Add a processor to export log record
loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
);
logsAPI.logs.setGlobalLoggerProvider(loggerProvider);

registerInstrumentations({
    instrumentations: [
        new WinstonInstrumentation({
            // See below for Winston instrumentation options.
        }),
    ],
});

const winston = require('winston');
const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
})
logger.info('foobar');
// {"message":"foobar","trace_id":"e21c7a95fff34e04f77c7bd518779621","span_id":"b7589a981fde09f4","trace_flags":"01", ...}
```

### Winston instrumentation options

| Option                  | Type              | Description |
| ----------------------- | ----------------- | ----------- |
| `disableLogSending`      | `boolean`         | Whether to disable [log sending](#log-sending). Default `false`. |
| `logSeverity`           | `SeverityNumber`  | Control severity level for [log sending](#log-sending). Default `SeverityNumber.UNSPECIFIED`, it will use Winston Logger's current level when unspecified. |
| `disableLogCorrelation` | `boolean`         | Whether to disable [log correlation](#log-correlation). Default `false`. |
| `logHook`               | `LogHookFunction` | An option hook to inject additional context to a log record after trace-context has been added. This requires `disableLogCorrelation` to be false. |  

### Log sending

Winston Logger will automatically send log records to the OpenTelemetry Logs SDK if not explicitly disabled in config and @opentelemetry/winston-transport npm package is installed in the project. The OpenTelemetry SDK can be configured to handle those records, for example, sending them on to an OpenTelemetry collector for log archiving and processing. The example above shows a minimal configuration that emits OpenTelemetry log records to the console for debugging.

If the OpenTelemetry SDK is not configured with a Logger provider, then this will be a no-op.

Log sending can be disabled with the `disableLogSending: true` option. Log sending is only available for Winston version 3 and later.

```bash
npm install --save @opentelemetry/winston-transport
```

### Log correlation

Winston logger calls in the context of a tracing span will have fields
indentifying the span added to the log record. This allows
[correlating](https://opentelemetry.io/docs/specs/otel/logs/#log-correlation)
log records with tracing data. The added fields are
([spec](https://opentelemetry.io/docs/specs/otel/compatibility/logging_trace_context/)):

* `trace_id`
* `span_id`
* `trace_flags`

After adding these fields, the optional `logHook` is called to allow injecting additional fields. For example:

```js
logHook: (span, record) => {
  record['resource.service.name'] = provider.resource.attributes['service.name'];
}
```

Log injection can be disabled with the `disableLogCorrelation: true` option.

### Supported versions

`1.x`, `2.x`, `3.x`

Log sending

`3.x`

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-winston
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-winston.svg
