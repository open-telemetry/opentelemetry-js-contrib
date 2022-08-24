# OpenTelemetry Lib for Fastly Compute@Edge (JS)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
> Light weight module to get traces, and support distributed tracing, in OTLP.

The intention of the module is to add support for OpenTelemetry tracing, with limited overhead and footprint, for services running on Fastly Compute@Edge.

## Installing / Getting started

To start using the module add it to your Fastly Compute@Edge service project. The primary function in the module is the wrapper that enables the tracing in your service and create the main span for your application. It also auto-intruments fetch calls from the service and allows trace information to be added to your logs (currently only for json-object type logs like Splunk).

The code changes required are per below. The commented line is to highlight how a event listner for the fetch event for a service typically looks like prior to the wrapping.

```javascript
const Tracer = require('opentelemetry-fastly-ce-instrumentation-lib');
const tracer = new Tracer();

// addEventListener('fetch', event => event.respondWith(handleRequest(event)));
addEventListener('fetch', event => event.respondWith(tracer.wrapper(handleRequest, event)));
```

To get the traces to your favourite trace sink, you should send them to an [Open Telemetry Collector](https://github.com/open-telemetry/opentelemetry-collector-contrib). The library generates traces in OTLP/JSON format and will send them over HTTPS (otlp http receiver in the Open Telemetry Collector). The configuration to enable traces to be forwarded to the collector is set with the functions `setOtelCollectorUrl`,  `setOtelCollectorBackend` and `setOtelCollectorUserCredentials`. See example below.

```javascript
tracer.setOtelCollectorUrl("https://my.otelcollector.net/v1/traces");
tracer.setOtelCollectorBackend("oi_collector_backend");
tracer.setOtelCollectorUserCredentials("dXNlcm5hbWU6cGFzc3dvcmQ=");
```

Details about futher methods and properties of the library are outlined in the [documentation](doc/README.md).

## Features

To keep the module/library light weigth, just a few key features from the OpenTelemetry API and SDK are added. The current implementation includes:

* Auto instrument the Fastly Compute@Edge service main function
* Distributed tracing based on traceparent header
* Auto instrumentation of external requests using `fetch`
* Auto injection of trace details to logs in json object format
* Start new spans in the code of the Fastly Compute@Edge service
* Add attributes to created spans

## Contributing

If you'd like to contribute, please fork the repository and use a feature
branch. Pull requests are warmly welcome. Please find more information in [CONTRIBUTING.md](CONTRIBUTING.md).

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For more information on Fastly Compute@Edge: <https://developer.fastly.com/learning/compute/>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## Licensing

The code in this repository is licensed under the Apache License 2.0
See the [LICENSE](LICENSE) for details.
