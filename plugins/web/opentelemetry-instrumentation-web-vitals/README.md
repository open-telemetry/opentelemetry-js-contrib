# OpenTelemetry Instrumentation Web Vitals

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides captures core [web-vitals](https://web.dev/vitals/) for Web applications.
Uses https://github.com/GoogleChrome/web-vitals to do the capturing and reports LCP, CLS and FID as "fake" spans that have 0 duration.
The real values are reported as attributes on those spans.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-web-vitals
```

## Usage

```js
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { WebVitalsInstrumentation } from '@opentelemetry/instrumentation-web-vitals';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new WebTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [new WebVitalsInstrumentation({enabled: false})],
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
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-instrumentation-web-vitals
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-instrumentation-web-vitals
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fweb%2Fopentelemetry-instrumentation-web-vitals&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fweb%2Fopentelemetry-instrumentation-web-vitals&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-web-vitals
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-web-vitals.svg
