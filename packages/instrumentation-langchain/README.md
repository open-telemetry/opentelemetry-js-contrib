# OpenTelemetry Spec Instrumentation for LangChain.js


[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @haneric00


This module provides automatic instrumentation for the [`AWS Lambda`](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.


This module provides automatic instrumentation for the ['langchain.js'] (https://v02.api.js.langchain.com/modules/langchain.html) module, which may be loaded using the [`@langchain/...`] packages.

This module is currently under active development and not ready for general use.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```


## Usage


To load the Langchain instrumentation, manually instrument the `@langchain/core/callbacks/manager` module. The callbacks manager must be manually instrumented due to the non-traditional module structure in `@langchain/core`.

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangChainInstrumentation } from "@opentelemetry/instrumentation-langchain";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

const provider = new NodeTracerProvider();
provider.register();

const lcInstrumentation = new LangChainInstrumentation();
// LangChain must be manually instrumented as it doesn't have a traditional module structure
lcInstrumentation.manuallyInstrument(CallbackManagerModule);
```

For more information on OpenTelemetry Node.js SDK, see the [OpenTelemetry Node.js SDK documentation](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/).


## Using a Custom Tracer Provider

You can specify a custom tracer provider when creating the LangChain instrumentation. This is useful when you want to use a non-global tracer provider or have more control over the tracing configuration.

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { LangChainInstrumentation } from "@opentelemetry/instrumentation-langchain";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

// Create a custom tracer provider
const customTracerProvider = new NodeTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "my-langchain-project",
  }),
});

// Pass the custom tracer provider to the instrumentation
const lcInstrumentation = new LangChainInstrumentation({
  tracerProvider: customTracerProvider,
});

// Manually instrument the LangChain module
lcInstrumentation.manuallyInstrument(CallbackManagerModule);
```

Alternatively, you can set the tracer provider after creating the instrumentation:

```typescript
const lcInstrumentation = new LangChainInstrumentation();
lcInstrumentation.setTracerProvider(customTracerProvider);
```