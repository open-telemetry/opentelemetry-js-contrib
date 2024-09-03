# OpenTelemetry Meta Package for Web Configuration

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

## About

This module provides helper function that simplify configuration of web instrumentation.

## Installation

```bash
npm install --save @opentelemetry/auto-configuration-web
```

## Usage

Configuring both Trace and Events SDKs:

```ts
import { configureWebSDK, getResource } from '@opentelemetry/auto-configuration-web';

const shutdown = configureWebSDK(
  {
    logRecordProcessors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    resource: getResource({
      serviceName: 'My app',
    })
  },
  instrumentations
);ts
```

Configuring Trace SDK only:

```ts
import { configureTraceSDK, getResource } from '@opentelemetry/auto-configuration-web';

const shutdown = configureTraceSDK(
  {
    resource: getResource({
      serviceName: 'My app'
    }),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  },
  instrumentations
);
```

Configuring Events SDK only:

```ts
import { configureEventsSDK, getResource } from '@opentelemetry/auto-configuration-web';

const shutdown = configureEventsSDK(
  {
    resource: getResource({
      serviceName: 'My app'
    }),
    logRecordProcessors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
  },
  instrumentations
);
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
