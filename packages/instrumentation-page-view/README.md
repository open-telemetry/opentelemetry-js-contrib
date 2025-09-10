# OpenTelemetry Instrumentation Page View

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for *page view* for Web applications. It uses the events sdk to create a page view event and sends it to the configured log processor. The page view event is created when the page is loaded or a route change occurs.
The event contains the following attributes:

- `name`: The name of the page view event.
- `timestamp`: The timestamp of the event.
- `data`: The data of the event. The data contains the following attributes:
  - `location`: The location of the page.
  - `referrer`: The referrer of the page.
  - `title`: The title of the page.
  - `url`: The url of the page.
  - `type`: The type of the page, either `page-load(base_page)` or `route-change(virtual_page)`.
  - `customAttributes`: The custom attributes added to the event. The custom attributes are added by the user.
Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-page-view
```

## Usage

```js
import { events } from '@opentelemetry/api-events';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { PageViewInstrumentation } from '@opentelemetry/instrumentation-page-view';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const loggerProvider = new LoggerProvider({resource: new Resource({[SEMRESATTRS_SERVICE_NAME]: '<service-name>'})});
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
events.setGlobalEventLoggerProvider(eventLoggerProvider);

registerInstrumentations({
  instrumentations : [
    new PageViewInstrumentation()
  ],
});

```


## Optional : Add custom attributes to events if needed

If it is needed to add custom data to the page view event, the following function needs to be provided
as a config to the Page View Event Instrumentation as shown below. The attributes will be added to the event data. If the function throws an error , no attributes will be added to the event.
the rest of the process continues.

```js
const addCustomDataToEvent = (event: Event) => {
  event.data['<custom.attribute.key>'] = '<custom-attribute-value>';
}

registerInstrumentations({
  instrumentations: [
    new PageViewEventInstrumentation({
        applyCustomEventData:addCustomDataToEvent
    })
    ]
})
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
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-page-view
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-page-view.svg

