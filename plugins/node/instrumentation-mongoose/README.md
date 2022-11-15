# OpenTelemetry mongoose Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`mongoose`](https://github.com/Automattic/mongoose) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mongoose
```

## Supported Versions

- `>=5.9.7 <7`

## Usage

To load a specific plugin, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { MongooseInstrumentation } = require('@opentelemetry/instrumentation-mongoose');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new MongooseInstrumentation(),
  ],
})
```

## Migration From opentelemetry-instrumentation-mongoose

This instrumentation was originally published and maintained under the name `"opentelemetry-instrumentation-mongoose"` in [this repo](https://github.com/aspecto-io/opentelemetry-ext-js).

Few breaking changes were made during porting to the contrib repo to align with conventions:

### Hook Info

The instrumentation's config `responseHook` functions signature changed, so the second function parameter is info object, containing the relevant hook data.

### `moduleVersionAttributeName` config option

The `moduleVersionAttributeName` config option is removed. To add the mongoose package version to spans, use the `moduleVersion` attribute in hook info for `responseHook` function.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mongoose
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mongoose.svg
