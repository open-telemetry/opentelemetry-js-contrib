# OpenTelemetry transport for winston

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides a Transport for [`winston`](https://www.npmjs.com/package/winston) module to send Winston logging to the OpenTelemetry Logging SDK.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/winston-transport
```

## Usage

This package exports the Winston transport class that is used to send records to the
OpenTelemetry Logs SDK. It can be used directly when configuring a Winston logger. If using
[`@opentelemetry/instrumenation-winston`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-winston)
package there is no need to instantiate the transport as the instrumentation will take care of that.
For example:

```js
const logsAPI = require('@opentelemetry/api-logs');
const {
    LoggerProvider,
    SimpleLogRecordProcessor,
    ConsoleLogRecordExporter,
} = require('@opentelemetry/sdk-logs');
const { OpenTelemetryTransportV3 } = require('@opentelemetry/winston-transport');
const winston = require('winston');


// To start a logger, you first need to initialize the Logger provider.
const loggerProvider = new LoggerProvider();
// Add a processor to export log record
loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
);
logsAPI.logs.setGlobalLoggerProvider(loggerProvider);

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3()
  ]
});
```

> [!IMPORTANT]
> Logs will be duplicated if `@opentelemetry/winston-transport` is added as a transport in `winston` and `@opentelemetry/instrumentation-winston` is configured with `disableLogSending: false`.

### Supported versions

- [`winston`](https://www.npmjs.com/package/winston) versions `>=3.0.0 <4`

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/winston-transport
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fwinston-transport.svg
