# OpenTelemetry Propagator OpenTracing

[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devdependencies-image]][devdependencies-url]
[![Apache License][license-image]][license-image]

## OpenTracing Format

```bash
ot-tracer-traceid: unsigned uint64 encoded as hex characters
ot-tracer-spanid: unsigned uint 64 encoded as hex characters
ot-tracer-sampled: boolean encoded as a string with the values true or false
ot-baggage-*: repeated string to string key-value baggage items
```

## Example Usage

```javascript
const api = require('@opentelemetry/api');
const { B3Propagator } = require('@opentelemetry/propagator-opentracing');

api.propagation.setGlobalPropagator(new OpenTracingPropagator());
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js/status.svg?path=packages/opentelemetry-propagator-opentracing
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js?path=packages%2Fopentelemetry-propagator-opentracing
[devdependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js/dev-status.svg?path=packages/opentelemetry-propagator-opentracing
[devdependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js?path=packages%2Fopentelemetry-propagator-opentracing&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/propagator-opentracing
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fpropagator-opentracing.svg
