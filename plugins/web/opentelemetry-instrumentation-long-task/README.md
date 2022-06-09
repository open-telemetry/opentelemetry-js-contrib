# OpenTelemetry Long Task Instrumentation for web

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [Long Task API][mdn-long-task] which may be loaded using the [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) package. It creates spans from tasks that take more than 50 milliseconds, all of the data reported via [`PerformanceLongTaskTiming`][mdn-performance-long-task-timing] is included as span attributes.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-web](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web) bundle with [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-long-task
```

## Usage

```js
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { LongTaskInstrumentation } from '@opentelemetry/instrumentation-long-task';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new WebTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [
    new LongTaskInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### longtask Instrumentation Options

| Options | Type | Description |
| --- | --- | --- |
| `observerCallback` | `ObserverCallback` | Callback executed on observed `longtask`, allowing additional attributes to be attached to the span. |

The `observerCallback` function is passed the created span and the `longtask` `PerformanceEntry`,
allowing the user to add custom attributes to the span with any logic.
For example, a webapp with client-side routing can add contextual information on the current page,
even if the tracer was instantiated before navigation.

Usage Example:

```js
longtaskInstrumentationConfig = {
  observerCallback: (span, longtaskEvent) => {
    span.setAttribute('location.pathname', window.location.pathname)
  }
}
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
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-long-task
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-long-task.svg
[mdn-long-task]: https://developer.mozilla.org/en-US/docs/Web/API/Long_Tasks_API
[mdn-performance-long-task-timing]: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
