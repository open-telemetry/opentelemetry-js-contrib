# OpenTelemetry Long Task Instrumentation for web

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This instrumentation creates spans from tasks that take more than 50 milliseconds using the [Long Task API][mdn-long-task].
All of the data reported via [`PerformanceLongTaskTiming`][mdn-performance-long-task-timing] is included as span attributes.

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
    new LongTaskInstrumentation(),
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
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-instrumentation-long-task
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-instrumentation-long-task
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-instrumentation-long-task&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-instrumentation-long-task&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-long-task
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-long-task.svg
[mdn-long-task]: https://developer.mozilla.org/en-US/docs/Web/API/Long_Tasks_API
[mdn-performance-long-task-timing]: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
