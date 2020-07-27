# OpenTelemetry Plugin React Load
[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
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

See [/examples/react-load](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/master/examples/react-load) for a short example.

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/plugin-react-load
[npm-img]: TODO:set_img_url
