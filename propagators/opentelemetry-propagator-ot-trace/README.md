# OpenTelemetry OTTracePropagator

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

## OT Trace Format

| Header Name         | Description                                                                                                                            | Required              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `ot-tracer-traceid` | uint64 encoded as a string of 16 hex characters                                                                                        | yes                   |
| `ot-tracer-spanid`  | uint64 encoded as a string of 16 hex characters                                                                                        | yes                   |
| `ot-tracer-sampled` | boolean encoded as a string with the values `'true'` or `'false'`                                                                      | no                    |
| `ot-baggage-*`      | repeated string to string key-value baggage items; keys are prefixed with `ot-baggage-` and the corresponding value is the raw string. | if baggage is present |

### Interop and trace ids

The OT trace propagation format expects trace ids to be 64-bits. In order to
interop with OpenTelemetry, trace ids need to be truncated to 64-bits before
sending them on the wire. When truncating, the least significant (right-most)
bits MUST be retained. For example, a trace id of
`3c3039f4d78d5c02ee8e3e41b17ce105` would be truncated to `ee8e3e41b17ce105`.

### Baggage Notes

Baggage keys and values are validated according to [rfc7230][rfc7230-url]. Any
keys or values that would result in invalid HTTP headers will be silently
dropped during inject.

OT Baggage is represented as multiple headers where the
names are carrier dependent. For this reason, they are omitted from the `fields`
method. This behavior should be taken into account if your application relies
on the `fields` functionality. See the [specification][fields-spec-url] for
more details.

## Example Usage

```javascript
const api = require('@opentelemetry/api');
const { OTTracePropagator } = require('@opentelemetry/propagator-ot-trace');

api.propagation.setGlobalPropagator(new OTTracePropagator());
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/propagator-ot-trace
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fpropagator-ot-trace.svg
[rfc7230-url]: https://tools.ietf.org/html/rfc7230#section-3.2
[fields-spec-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/context/api-propagators.md#fields
