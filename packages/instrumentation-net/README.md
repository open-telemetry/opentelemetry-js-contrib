# OpenTelemetry Net module Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`net`](http://nodejs.org/dist/latest/docs/api/net.html) module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](https://www.npmjs.com/package/@opentelemetry/sdk-node) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

Supports both TCP and IPC connections.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-net
```

## Supported Versions

- Node.js `>=14`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { NetInstrumentation } = require('@opentelemetry/instrumentation-net');

const sdk = new NodeSDK({
  instrumentations: [
    new NetInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Semantic Conventions

This instrumentation uses stable semantic conventions for networking attributes.

The `instrumentation-net` versions 0.64.0 and later emit the stable v1.23.0+ semantic conventions.

| Attribute               | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `network.transport`     | One of `tcp` or `pipe`                                                           |
| `server.address`        | Host name or the IPC file path                                                   |
| `server.port`           | Remote port number                                                               |
| `network.peer.address`  | Peer address of the network connection - IP address or Unix domain socket name.  |
| `network.local.address` | Local address of the network connection - IP address or Unix domain socket name. |
| `network.local.port`    | Local port number of the network connection.                                     |

### TLS attributes

For `tls.connect()`, an additional `tls.connect` span is created as the parent of the `tcp.connect` span.
It uses the [TLS semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/tls/).
These are still in Development status, so they can change in a future minor release of this package.

| Attribute                | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `tls.established`        | `true` when the TLS handshake completed, `false` when the socket errored before that     |
| `tls.protocol.name`      | Negotiated protocol name, `tls` or `ssl`                                                 |
| `tls.protocol.version`   | Negotiated protocol version, e.g. `1.2` or `1.3`                                         |
| `tls.cipher`             | IANA name of the negotiated cipher suite                                                 |
| `tls.next_protocol`      | Negotiated ALPN protocol, e.g. `http/1.1`, if any                                        |
| `tls.server.hash.sha1`   | SHA-1 fingerprint of the server certificate                                              |
| `tls.server.hash.sha256` | SHA-256 fingerprint of the server certificate                                            |
| `tls.server.not_before`  | Start of the server certificate validity period (ISO 8601)                               |
| `tls.server.not_after`   | End of the server certificate validity period (ISO 8601)                                 |

The `tls.server.*` attributes are omitted when the server did not send a certificate, for example for a resumed TLS 1.2 session.

Earlier versions of this instrumentation emitted non-standard attributes instead: `tls.protocol`, `tls.authorized`, `tls.cipher.name`, `tls.cipher.version`, `tls.certificate.fingerprint`, `tls.certificate.serialNumber`, `tls.certificate.validFrom`, `tls.certificate.validTo` and `tls.alpnProtocol`, along with the exported `TLSAttributes` enum.


## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-net
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-net.svg
