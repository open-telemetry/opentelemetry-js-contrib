# OpenTelemetry Meta Packages for Node
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

## Installation

```bash
npm install --save @opentelemetry/auto-instrumentations-node
```

## Usage

```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const exporter = new CollectorTraceExporter({
  serviceName: 'auto-instrumentations-node',
});

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    getNodeAutoInstrumentations({
      // load custom configuration for http instrumentation
      "@opentelemetry/instrumentation-http": {
        applyCustomAttributesOnSpan: (span)=> {
          span.setAttribute('foo2', 'bar2');
        },
      },
    }),
  ],
});

```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=metapackages%2Fauto-instrumentations-node
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=metapackages%2Fauto-instrumentations-node
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=metapackages%2Fauto-instrumentations-node&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=metapackages%2Fauto-instrumentations-node&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
