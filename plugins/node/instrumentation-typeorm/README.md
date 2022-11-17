# OpenTelemetry TypeORM Instrumentation for Node.js
[![NPM version](https://img.shields.io/npm/v/@opentelemetry/instrumentation-typeorm.svg)](https://www.npmjs.com/package/@opentelemetry/instrumentation-typeorm)

This module provides automatic instrumentation for [`TypeORM`](https://typeorm.io/).

## Installation

```
npm install --save @opentelemetry/instrumentation-typeorm
```

## Supported Versions
This instrumentation supports `>0.2.28`:

## Usage
For further automatic instrumentation instruction see the [@opentelemetry/instrumentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation) package.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { TypeormInstrumentation } = require('@opentelemetry/instrumentation-typeorm');

const tracerProvider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    typeorm: { enabled: false, path: 'opentelemetry-plugin-typeorm' }
  }
});

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new TypeormInstrumentation({
      // see under for available configuration
    })
  ]
});
```

### TypeORM Instrumentation Options

TypeORM instrumentation has few options available to choose from. You can set the following:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `responseHook` | `TypeormResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `moduleVersionAttributeName` | `string` | If passed, a span attribute will be added to all spans with key of the provided `moduleVersionAttributeName` and value of the patched module version |
| `suppressInternalInstrumentation` | boolean | Typeorm operation use mongodb/postgres/mysql/mariadb/etc. under the hood. If, for example, postgres instrumentation is enabled, a postgres operation will also create a postgres span describing the communication. Setting the `suppressInternalInstrumentation` config value to `true` will cause the instrumentation to suppress instrumentation of underlying operations. |
| `enableInternalInstrumentation` | boolean |  Some methods such as `getManyAndCount` can generate internally multiple spans. To instrument those set this to `true`|
| `collectParameters` | boolean | set to `true` if you want to capture the parameter values for parameterized SQL queries (**may leak sensitive information**)
---

This extension (and many others) was developed by [Aspecto](https://www.aspecto.io/) with ❤️
