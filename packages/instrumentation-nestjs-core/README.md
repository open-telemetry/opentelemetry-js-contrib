# OpenTelemetry NestJS Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [Nest framework][pkg-web-url] module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-nestjs-core
```

### Supported Versions

- [`@nestjs/core`](https://www.npmjs.com/package/@nestjs/core) versions `>=4.0.0 <12`

## Usage

OpenTelemetry Nest Instrumentation allows the user to automatically collect trace data from the controller handlers and export them to the backend of choice.

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { NestInstrumentation } = require('@opentelemetry/instrumentation-nestjs-core');

const sdk = new NodeSDK({
  instrumentations: [
    new NestInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Emitted Spans

| Name                            | `nestjs.type`     | Description                                                                | Included attributes         |
|---------------------------------|-------------------|----------------------------------------------------------------------------|-----------------------------|
| `Create Nest App`               | `app_creation`    | Traces the bootup for the Nest App. The `NestFactory(Static).create` call. | `nestjs.module`             |
| `<ControllerName>.<memberName>` | `request_context` | Traces the whole request context.                                          | `http.*`, `nestjs.callback` |
| `<memberName>`                  | `handler`         | Traces the work of a specific controller member function.                  | `nestjs.callback`           |

## Semantic Conventions

This instrumentation creates spans with attributes from the HTTP and NestJS semantic conventions.

The `instrumentation-nestjs-core` versions 0.66.0 and later emit the stable v1.23.0+ semantic conventions.

Attributes collected:

| Attribute             | Short Description                                                 |
|-----------------------|-------------------------------------------------------------------|
| `component`*          | "@nestjs/core"                                                    |
| `nestjs.version`*     | Version of instrumented `@nestjs/core` package                    |
| `nestjs.type`*        | See [NestType](./src/enums/NestType.ts)                           |
| `nestjs.module`       | Nest module class name                                            |
| `nestjs.controller`   | Nest controller class name                                        |
| `nestjs.callback`     | The function name of the member in the controller                 |
| `http.route`          | Route assigned to handler. Ex: `/users/:id`                       |
| `http.request.method` | HTTP method.                                                      |
| `url.full`            | Full request URL.                                                 |

\* included in all of the spans.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-nestjs-core
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-nestjs-core.svg
[pkg-web-url]: https://nestjs.com/
