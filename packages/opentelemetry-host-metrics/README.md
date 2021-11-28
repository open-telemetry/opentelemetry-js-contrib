# OpenTelemetry Host Metrics for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

This module provides automatic collection of Host Metrics which includes metrics for:

* CPU
* Memory
* Network

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/host-metrics
```

## Usage

```javascript
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter(
  { startServer: true },() => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  }
);

const meterProvider = new MeterProvider({
  exporter,
  interval: 2000,
});

const hostMetrics = new HostMetrics({ meterProvider, name: 'example-host-metrics' });
hostMetrics.start();

```

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-host-metrics
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-host-metrics
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-host-metrics&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-host-metrics&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/host-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fhost-metrics.svg
