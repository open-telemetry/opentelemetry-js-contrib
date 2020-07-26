# OpenTelemetry Propagator AWS Xray
[![Gitter chat][gitter-image]][gitter-url]
[![Apache License][license-image]][license-image]

OpenTelemetry AWS Xray propagator provides HTTP header propagation for systems that are using AWS Xray HTTP header format.

[Example Tracing Header](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html#xray-concepts-tracingheader):

```X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1```

Format:
X-Amzn-Trace-Id: Root=1-{trace-id-1}-{trace-id-2};Parent={span-id};Sampled={flags}

* {trace-id-1}
    * 32-bit number in base16 format, encoded from time(second) when created.
    * Can be referred: [AWS Xray Trace ID](https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html#xray-api-traceids)
* {trace-id-2}
    * 96-bit random number in base16 format
* {span-id}
    * 64-bit random number in base16 format.
* {flags}
    * One byte bitmap, as two hex digits.
    * Can be referred: [JavaScript TraceFlags](https://github.com/open-telemetry/opentelemetry-js/blob/e9b2cf9aeb1daf5ffbab800681bfe1cafc636576/packages/opentelemetry-api/src/trace/trace_flags.ts)

Example of usage (will be added after published):
## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/master/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat