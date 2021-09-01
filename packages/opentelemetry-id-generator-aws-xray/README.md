# AWS OpenTelemetry X-Ray IdGenerator

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @willarmiros @NathanielRN

The OpenTelemetry IdGenerator for AWS X-Ray generates trace IDs with its first four bytes set to the start time of the
trace followed by a unique identifier consisting of 12 bytes of randomly generated numbers. OpenTelemetry offers an
extension point which allows the usage of this custom IdGenerator as opposed to the out-of-the-box random IdGenerator,
enabling compatibility with AWS X-Ray.

### Installation

`
npm install --save @opentelemetry/id-generator-aws-xray
`

### Usage

In the [global tracer configuration file](https://github.com/open-telemetry/opentelemetry-js/blob/master/getting-started/README.md#initialize-a-global-tracer),
configure the following:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { AWSXRayIdGenerator } = require('@opentelemetry/id-generator-aws-xray');

const tracerConfig = {
  idGenerator: new AWSXRayIdGenerator(),
  resources: resources
};
const tracerProvider = new NodeTracerProvider(tracerConfig);
```

### Trace ID Details

Example trace ID format: 58406520a006649127e371903a2de979

A trace ID consists of two parts; the timestamp and the unique identifier.

#### Time Stamp

* the first 8 hexadecimal digits represent the time of the original request in Unix epoch time
* for example, 10:00AM December 1st, 2016 PST in epoch time is 1480615200 seconds, or 58406520 in hexadecimal digits.

#### Unique Identifier

* the last 24 hexadecimal digits is an random identifier for the trace

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

### License

Apache 2.0 - See [LICENSE][license-url] for more information.
[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-id-generator-aws-xray
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-id-generator-aws-xray
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fopentelemetry-id-generator-aws-xray&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-id-generator-aws-xray&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/id-generator-aws-xray
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fid-generator-aws-xray.svg
