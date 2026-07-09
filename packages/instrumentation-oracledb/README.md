# OpenTelemetry OracleDB Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`oracledb`](https://www.npmjs.com/package/oracledb) module.

If total installation size is not constrained, it is recommended to use the
[`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node)
bundle with
[`@opentelemetry/sdk-node`](https://www.npmjs.com/package/@opentelemetry/sdk-node)
for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-oracledb
```

## Supported Versions

- [`oracledb`](https://www.npmjs.com/package/oracledb) versions `>=6.7.0 <8`

## Usage

OpenTelemetry OracleInstrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [oracledb](https://www.npmjs.com/package/oracledb). This module works with both Thin and Thick modes of the oracledb
package, although there may be some caveats with Thick Mode now, which are listed in a later paragraph.

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');

const sdk = new NodeSDK({
  instrumentations: [
    new OracleInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

Caveats with  ``oracledb`` Thick mode:

- RoundTrip Spans will not appear for Thick Mode
- Hostname will not be available in Thick Mode

This instrumentation supports both Thin and Thick mode in `oracledb`.

### Span Types Created

This instrumentation creates spans for connection establishment, query
execution, and LOB operations.

| Span Name | Description | When Created |
| --------- | ----------- | ------------ |
| `oracledb.getConnection` | Standalone connection acquisition | When `oracledb.getConnection()` is called |
| `oracledb.createPool` | Pool creation | When `oracledb.createPool()` is called |
| `oracledb.Pool.getConnection` | Pool connection acquisition | When `pool.getConnection()` is called |
| `oracledb.Connection.execute:<OPERATION> <db.namespace>` | SQL execution | When `connection.execute()` is called |
| `oracledb.Connection.executeMany:<OPERATION> <db.namespace>` | Batch SQL execution | When `connection.executeMany()` is called |
| `oracledb.Connection.close` | Connection close | When `connection.close()` is called |
| `oracledb.Connection.createLob` | Temporary LOB creation | When `connection.createLob()` is called |
| `oracledb.Lob.getData` | LOB data read | When `lob.getData()` is called |

For Thin mode, additional internal round-trip spans will be emitted, such as:

- `oracledb.FastAuthMessage`
- `oracledb.AuthMessage`
- `oracledb.ProtocolMessage`
- `oracledb.DataTypeMessage`
- `oracledb.ExecuteMessage`
- `oracledb.LogOffMessage`
- `oracledb.LobOpMessage`

### OracleDB Instrumentation Options

| Options | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `enhancedDatabaseReporting` | `boolean` | `false` | If true, adds SQL bind values as `db.operation.parameter.<key>` attributes. When enabled, it also records `db.query.text`. This can capture sensitive data and should be used with care. |
| `dbStatementDump` | `boolean` | `false` | If true, records the SQL statement as `db.query.text`. |
| `requestHook` | `OracleInstrumentationExecutionRequestHook` | `undefined` | Hook for adding custom span attributes based on the query input and connection metadata. |
| `responseHook` | `OracleInstrumentationExecutionResponseHook` | `undefined` | Hook for adding custom span attributes based on the database response. |
| `requireParentSpan` | `boolean` | `false` | If true, only creates spans when there is an active parent span. |
| `propagateTraceContextToSessionAction` | `boolean` | `false` | If true, injects W3C Trace Context into the Oracle `V$SESSION.ACTION` field so database-side tracing can be correlated with application spans. |

## OracleDB-specific Notes

- Thin mode emits internal round-trip spans. Thick mode does not.
- Thick mode does not expose the same low-level network metadata, so attributes
  such as `server.address`, `server.port`, and `network.transport` are
  missing.
- Oracle connection metadata such as `oracle.db.name`,
  `oracle.db.instance.name`, `oracle.db.pdb`, `oracle.db.domain`, and the final
  effective `oracle.db.service` are only available after connection metadata has
  been resolved by the driver.
- Failed logins may still include the attempted service name, which is useful
  for debugging connection issues.

## Semantic Conventions

This instrumentation now emits the current Oracle database semantic
conventions directly.

This includes:

- `db.namespace` using Oracle `DB_UNIQUE_NAME`
- removal of `db.user`
- Oracle-specific attributes such as `oracle.db.domain`,
  `oracle.db.instance.name`, `oracle.db.name`, `oracle.db.pdb`, and
  `oracle.db.service` when available

This is a breaking semantic change from the older OracleDB instrumentation
behavior, where `db.namespace` used a concatenated
`<instance>|<pdb>|<service>` value and `db.user` was emitted.

The Oracle-specific `oracle.db.*` attributes are currently Release Candidate in
the semantic conventions.

### Attributes collected

Breaking semantic changes:

| Previous behavior | Current behavior | Short Description |
| ----------------- | ---------------- | ----------------- |
| `db.user` | Removed | Database user name |
| `db.namespace="<instance>\|<pdb>\|<service>"` | `db.namespace="<dbUniqueName>"` | Oracle database identifier now uses `DB_UNIQUE_NAME`. |

Other emitted attributes:

| Attribute | Short Description |
| --------- | ----------------- |
| `db.system.name` | Database product identifier |
| `network.transport` | Network transport |
| `server.address` | Remote database host |
| `server.port` | Remote database port |
| `db.query.text` | SQL text when `dbStatementDump` or `enhancedDatabaseReporting` is enabled |

| Attribute | Short Description |
| --------- | ----------------- |
| `oracle.db.name` | Database name |
| `oracle.db.instance.name` | Oracle instance name |
| `oracle.db.pdb` | Pluggable database name |
| `oracle.db.domain` | Database domain |
| `oracle.db.service` | Effective Oracle service name |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-oracledb
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-oracledb.svg
