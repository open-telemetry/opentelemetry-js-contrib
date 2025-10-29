# OpenTelemetry Instrumentation Browser Navigation

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for browser navigation in Web applications. It emits log records via the Logs API to represent:

- Page load (hard navigation)
- Same-document navigations (soft navigations) such as history changes, back/forward, and hash changes

Each emitted log record has `eventName = browser.navigation` and includes attributes (aligned with semantic-conventions PR 2806):

- `url.full`: Full URL of the current page.
- `browser.navigation.same_document`: boolean, true when navigation is within the same document.
- `browser.navigation.hash_change`: boolean, true when the navigation is a fragment/hash change.
- `browser.navigation.type`: optional string: `push` | `replace` | `reload` | `traverse`.

You can add custom attributes through a configuration callback. Compatible with OpenTelemetry JS API and SDK `1.0+`.
Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-browser-navigation
```

## Usage

```ts
import { logs } from '@opentelemetry/api-logs';
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BrowserNavigationInstrumentation } from '@opentelemetry/instrumentation-browser-navigation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const loggerProvider = new LoggerProvider({
  resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: '<service-name>' }),
});
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
logs.setGlobalLoggerProvider(loggerProvider);

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      // All true by default; override as needed
      emitOnPageLoad: true,
      emitOnHistoryChange: true,
      emitOnPopState: true,
      emitOnHashChange: true,
      // useNavigationApiIfAvailable: false,
    }),
  ],
});
```


## Optional : Add custom attributes to events if needed

If you need to add custom attributes to each navigation event, provide a callback via `applyCustomLogRecordData`:

```ts
const applyCustom = (logRecord) => {
  logRecord.attributes = logRecord.attributes || {};
  logRecord.attributes['example.user.id'] = '123';
};

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({ applyCustomLogRecordData: applyCustom }),
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
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-browser-navigation
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-browser-navigation.svg

