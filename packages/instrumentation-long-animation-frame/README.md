# OpenTelemetry Long Animation Frames Instrumentation for web

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [Long Animation Frames API][mdn-long-animation-frames], which may be loaded using the [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) package. It creates a span for every long animation frame (a rendering update delayed beyond 50ms), with the timing breakdown reported via [`PerformanceLongAnimationFrameTiming`][mdn-performance-long-animation-frame-timing] (and its [`PerformanceScriptTiming`][mdn-performance-script-timing] entries) included as span attributes.

The Long Animation Frames API is the successor to the deprecated [Long Tasks API](https://developer.mozilla.org/en-US/docs/Web/API/Long_Tasks_API), which this package is intended to replace.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-long-animation-frame
```

## Usage

```js
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { LongAnimationFrameInstrumentation } from '@opentelemetry/instrumentation-long-animation-frame';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new WebTracerProvider({
  spanProcessors: [
    new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }),
  ],
});

registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [
    new LongAnimationFrameInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### Long Animation Frame Instrumentation Options

| Options | Type | Description |
| --- | --- | --- |
| `observerCallback` | `ObserverCallback` | Callback executed on observed `long-animation-frame`, allowing additional attributes to be attached to the span. |

The `observerCallback` function is passed the created span and the `long-animation-frame` `PerformanceEntry`,
allowing the user to add custom attributes to the span with any logic.
For example, a web app with client-side routing can add contextual information on the current page,
even if the tracer was instantiated before navigation.

Usage Example:

```js
const longAnimationFrameInstrumentationConfig = {
  observerCallback: (span, longAnimationFrameEvent) => {
    span.setAttribute('location.pathname', window.location.pathname)
  }
}
```

## Semantic Conventions

This package does not currently generate any attributes from semantic conventions.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-long-animation-frame
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-long-animation-frame.svg
[mdn-long-animation-frames]: https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing
[mdn-performance-long-animation-frame-timing]: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming
[mdn-performance-script-timing]: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceScriptTiming
