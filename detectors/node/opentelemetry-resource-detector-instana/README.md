# OpenTelemetry Resource Detector for Instana

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This resource detector will detect the Instana agent to register the Opentelemetry as a Node.js process. The created resource will be automatically merged with the existing resources and contains the real PID, which is returned from the Instana agent. This mechanism is needed to connect the Node.js Otel process with the incoming Opentelemetry spans.

## Installation

```bash
npm install --save @opentelemetry/resource-detector-instana
```

## Environment variables

- INSTANA_AGENT_HOST: The Instana agent hostname.
- INSTANA_AGENT_PORT: The Instana agent port.
- INSTANA_RETRY_TIMEOUT_MS: The resource detector does three retries to connect to the Instana agent. This is the timeout between the retries.
- INSTANA_RETRY_TIMEOUT_MS: The client timeout when connecting the Instana agent.

## Usage

```typescript
import {
  Resource,
  processDetector,
  envDetector,
} from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { instanaAgentDetector } from "@opentelemetry/resource-detector-instana";

const globalResource = new Resource({
   [SemanticResourceAttributes.SERVICE_NAME]: "TestService",
});

const sdk = new NodeSDK({
   autoDetectResources: false,
   resource: globalResource,
});

(async () => {
   await sdk.detectResources({
      detectors: [envDetector, processDetector, instanaAgentDetector],
   });

   await sdk.start();
}());
```

## Useful links

- For more information about Instana Agent, visit: <https://www.ibm.com/docs/en/instana-observability/current?topic=instana-host-agent>
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-instana
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-instana.svg
