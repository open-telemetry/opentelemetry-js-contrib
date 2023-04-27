# OpenTelemetry Page View Event Instrumentation for Web

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

**Note: This is an experimental package under active development. New releases may include breaking changes.**

This module provides automatic instrumentation for web pages by sending a log record for a page view event.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-page-view
```

## Usage

OpenTelemetry Page View Instrumentation allows the user to automatically collect log data of the page view event and export them to their backend of choice.

To use this instrumentation register it in the list of instrumentations as follows

```js
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { PageViewEventInstrumentation } from "@opentelemetry/instrumentation-page-view";
import {
  BatchLogRecordProcessor,
  LoggerProvider
} from '@opentelemetry/sdk-logs';
import { OTLPLogsExporter } from "@opentelemetry/exporter-logs-otlp-proto";

const logProvider = new LoggerProvider();

logProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(
    new OTLPLogsExporter({
      url: "https://log_endpoint_url",
      headers: { Accept: "application/x-protobuf" },
    }),
    {
      exportTimeoutMillis: 1000,
      scheduledDelayMillis: 1000,
    }
  ));

registerInstrumentations({
  instrumentations: [
      new PageViewEventInstrumentation({ provider: logProvider }),
  ],
});

```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-http
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-http.svg
