# OpenTelemetry instrumentation for cassandra-driver

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for injection of trace context to [`cassandra-driver`](https://www.npmjs.com/package/cassandra-driver).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-cassandra-driver
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { CassandraDriverInstrumentation } = require('@opentelemetry/instrumentation-cassandra-driver');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new CassandraDriverInstrumentation(),
    // other instrumentations
  ],
});

const cassandra = require('cassandra-driver');
const client = new cassandra.Client({ ... });
await client.execute('select * from foo');
```

### Instrumentation options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `enhancedDatabaseReporting` | `boolean` | `false` | Whether to include database queries with spans. These can contain sensitive information when using unescaped parameters - i.e. `insert into persons (name) values ('Bob')` instead of `insert into persons (name) values (?)`. |
| `maxQueryLength` | `number` | `65536` | If `enhancedDatabaseReporting` is enabled, limits the attached query strings
to this length. |

### Supported versions

`>=4.4 <5.0`

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-cassandra-driver
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-cassandra-driver.svg
