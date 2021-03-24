# OpenTelemetry Plugin React Load

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![peerDependencies][peerDependencies-image]][peerDependencies-url]
[![Apache License][license-image]][license-image]

This module provides *automated instrumentation for React lifecycles* for Web applications.

## Installation

```bash
npm install --save @opentelemetry/plugin-react-load
```

## Usage

```js
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';

// Set once for the entire plugin
BaseOpenTelemetryComponent.setLogger(logger);
BaseOpenTelemetryComponent.setTracer('name', 'version');
```

To instrument components, extend `BaseOpenTelemetryComponent`:
```js
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';

export class Component1 extends BaseOpenTelemetryComponent { ... }
```

See [/examples/react-load](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/react-load) for a short example.

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load&type=dev
[peerDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load&type=peer
[peerDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-plugin-react-load&type=peer
[npm-url]: https://www.npmjs.com/package/@opentelemetry/plugin-react-load
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fplugin-react-load.svg
