#OpenTelemetry RCA Metrics for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

This module provides automatic collection of RCA Metrics

## Installation

```bash
npm install --save @opentelemetry/rca-metrics
```

## Usage

```javascript
const { RCAMetrics } = require('@opentelemetry/rca-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter(
  { startServer: true },() => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  }
);

const rcaMetrics = new RCAMetrics({
  exporter,
  interval: 5000, // default 60000 (60s)
});
rcaMetrics.start();
```

### Install native stats for active platform
```shell script
npm run build:install
```

### Install native stats for custom platform arch and version
```shell script
#for example
npm run build:install platform=darwin arch=x64 version=10
npm run build:install platform=win32 arch=x64 version=10
```

### Build native stats for all platforms (osx, linux, windows) - this is done on circleci only - you should not need that
```shell script
npm run build:all
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js-contrib.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-rca-metrics
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-rca-metrics
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-rca-metrics&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-rca-metrics&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/rca-metrics
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Frca-metrics.svg
