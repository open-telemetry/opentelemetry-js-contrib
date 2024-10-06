# OpenTelemetry OpenAI Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`openai`](https://github.com/openai) module, which may be loaded using the [`@opentelemetry/instrumentation-openai`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-openai) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-openai
```

### Supported Versions

- [`openai`](https://www.npmjs.com/package/openai) versions `>=3.1.0 <5`

## Usage

```js
import {
  OpenAIInstrumentation,
  type InstrumentationHelperConfigInterface,
} from '@opentelemetry/instrumentation-openai';
import openAI from 'openai';

const openAIInstrumentationOptions: InstrumentationHelperConfigInterface = {
  environment: 'production',
  applicationName: 'Example Application',
  otlpEndpoint: 'otlpEndpoint',
  otlpHeaders: 'otlpHeaders',
  traceContent: true,
  pricing_json: {
    chat: {
      'gpt-4-1106-preview': { promptPrice: 0.04, completionPrice: 0.03 },
    },
  },
};

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

const openAIInstrument = new OpenAIInstrumentation(
  openAIInstrumentationOptions
);

// Auto instrumentation : patch method will only when the "openai" module is required in any trace calls
registerInstrumentations({
  instrumentations: [openAIInstrument],
});

// Or

// Manual patch
openAIInstrument.setTracerProvider(tracerProvider);
openAIInstrument.manualPatch(openAI);
registerInstrumentations({
  tracerProvider,
});
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-openai
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-openai.svg
