# OpenTelemetry LlamaIndex Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`llamaindex`](https://www.npmjs.com/package/llamaindex).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-llama-index
```

## Supported Versions

- [`llamaindex`](https://www.npmjs.com/package/llamaindex) versions `>=0.1.0`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { LlamaIndexInstrumentation } = require('@opentelemetry/instrumentation-llama-index');

const sdk = new NodeSDK({
  instrumentations: [
    new LlamaIndexInstrumentation({
      // Configuration options
      captureContent: true, // Set to false to omit prompt and response content from attributes
    }),
  ],
});
sdk.start();
```

### Semantic Conventions

This instrumentation emits spans conforming to the OpenTelemetry Generative AI semantic conventions:

- **Query / Workflow**: Spans named `invoke_workflow RetrieverQueryEngine` with `gen_ai.operation.name: 'invoke_workflow'` and `gen_ai.workflow.name: 'RetrieverQueryEngine'`.
- **Retrieval**: Spans named `retrieval` with `gen_ai.operation.name: 'retrieval'`, `gen_ai.retrieval.query.text`, and `gen_ai.retrieval.documents`.
- **Embeddings**: Spans named `embeddings {model}` with `gen_ai.operation.name: 'embeddings'`, `gen_ai.provider.name: 'llamaindex'`, `gen_ai.request.model`, and `gen_ai.embeddings.dimension.count`.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-llama-index
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-llama-index.svg
