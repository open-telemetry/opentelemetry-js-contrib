# OpenTelemetry Propagator OpenTracing

[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devdependencies-image]][devdependencies-url]
[![Apache License][license-image]][license-image]

## OpenTracing Format

| Header Name         | Description                                                                                                                            | Required              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `ot-tracer-traceid` | uint64 encoded as a string of 16 hex characters                                                                                        | yes                   |
| `ot-tracer-spanid`  | uint64 encoded as a string of 16 hex characters                                                                                        | yes                   |
| `ot-tracer-sampled` | boolean encoded as a string with the values `'true'` or `'false'`                                                                      | no                    |
| `ot-baggage-*`      | repeated string to string key-value baggage items; keys are prefixed with `ot-baggage-` and the corresponding value is the raw string. | if baggage is present |

### Interop and trace ids

The OpenTracing propagation format expects trace ids to be 64-bits. In order to
interop with OpenTelemetry, trace ids need to be truncated to 64-bits before
sending them on the wire. When truncating, the least significant (right-most)
bits MUST be retained. For example, a trace id of
`3c3039f4d78d5c02ee8e3e41b17ce105` would be truncated to `ee8e3e41b17ce105`.

## Example Usage

```javascript
const api = require('@opentelemetry/api');
const {
  OpenTracingPropagator,
} = require('@opentelemetry/propagator-opentracing');

api.propagation.setGlobalPropagator(new OpenTracingPropagator());
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js-contrib.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-propagator-opentracing
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-propagator-opentracing
[devdependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-propagator-opentracing
[devdependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-propagator-opentracing&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/propagator-opentracing
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fpropagator-opentracing.svg
