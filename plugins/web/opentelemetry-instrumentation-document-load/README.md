# OpenTelemetry Instrumentation Document Load

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for *document load* for Web applications, which may be loaded using the [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) package.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-web`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web) bundle with [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-document-load
```

## Usage

```js
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { CompositePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';

const provider = new WebTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

provider.register({
  propagator: new CompositePropagator({
    propagators: [
      new B3Propagator(),
      new W3CTraceContextPropagator(),
    ],
  }),
});

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/localhost/],
      propagateTraceHeaderCorsUrls: [
        'http://localhost:8090',
      ],
    }),
  ],
});

```

## Optional: Send a trace parent from your server

This instrumentation supports connecting the server side spans for the initial HTML load with the client side span for the load from the browser's timing API. This works by having the server send its parent trace context (trace ID, span ID and trace sampling decision) to the client.

Because the browser does not send a trace context header for the initial page navigation, the server needs to fake a trace context header in a middleware and then send that trace context header back to the client as a meta tag *traceparent* . The *traceparent* meta tag should be in the [trace context W3C draft format][trace-context-url] . For example:

```html
  ...
<head>
  <!--
    https://www.w3.org/TR/trace-context/
    Set the `traceparent` in the server's HTML template code. It should be
    dynamically generated server side to have the server's request trace Id,
    a parent span Id that was set on the server's request span, and the trace
    flags to indicate the server's sampling decision
    (01 = sampled, 00 = notsampled).
    '{version}-{traceId}-{spanId}-{sampleDecision}'
  -->
  <meta name="traceparent" content="00-ab42124a3c573678d4d8b21ba52df3bf-d21f7bc17caa5aba-01">
</head>
<body>
  ...
  <script>
    // and then initialise the WebTracer
    // var webTracer = new WebTracer({ .......
  </script>
</body>
```

## Optional : Add custom attributes to spans if needed

If it is needed to add custom attributes to the document load span,and/or document fetch span and/or resource fetch spans, respective functions to do so needs to be provided
as a config to the DocumentLoad Instrumentation as shown below. The attributes will be added to the respective spans
before the individual are spans are ended. If the function throws an error , no attributes will be added to the span and
the rest of the process continues.

```js
const addCustomAttributesToSpan = (span: Span) => {
  span.setAttribute('<custom.attribute.key>','<custom-attribute-value>');
}
const addCustomAttributesToResourceFetchSpan = (span: Span, resource: PerformanceResourceTiming) => {
  span.setAttribute('<custom.attribute.key>','<custom-attribute-value>');
  span.setAttribute('resource.tcp.duration_ms', resource.connectEnd - resource.connectStart);
}
registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation({
        applyCustomAttributesOnSpan: {
            documentLoad: addCustomAttributesToSpan,
            resourceFetch: addCustomAttributesToResourceFetchSpan
        }
    })
    ]
})
```

See [examples/tracer-web](https://github.com/open-telemetry/opentelemetry-js/tree/main/examples/tracer-web) for a short example.

## Semantic Conventions

This package uses `@opentelemetry/semantic-conventions` version `1.22+`, which implements Semantic Convention [Version 1.7.0](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.7.0/semantic_conventions/README.md)

Attributes collected:

| Attribute         | Short Description                                                              | Notes                           |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| `http.url`        | Full HTTP request URL in the form `scheme://host[:port]/path?query[#fragment]` | Key: `SEMATTRS_HTTP_URL`        |
| `http.user_agent` | Value of the HTTP User-Agent header sent by the client                         | Key: `SEMATTRS_HTTP_USER_AGENT` |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-document-load
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-document-load.svg
[trace-context-url]: https://www.w3.org/TR/trace-context
