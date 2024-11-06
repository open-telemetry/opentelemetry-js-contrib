# OpenTelemetry Meta Package for Propagators Configuration

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

## About

This module provides a way to get a propagator based on the [OTEL_PROPAGATORS environment variable][env-var-url].

## Installation

```bash
npm install --save @opentelemetry/auto-configuration-propagators
```

## Usage

Here is an example of how to retrieve a propagator:

```js
import { getPropagator } from '@opentelemetry/auto-configuration-propagators';

const propagator = getPropagator();
```

Please see the [Supported propagators](#supported-propagators) section for more information.

## Supported propagators

The specification defines a list of [known propagators][env-var-url] for the `OTEL_PROPAGATORS` env variable. Only these propagators are supported.

- "tracecontext": [W3C Trace Context](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core)
- "baggage": [W3C Baggage](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core)
- "b3": [B3 Single](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-propagator-b3)
- "b3multi": [B3 Multi](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-propagator-b3)
- "jaeger": [Jaeger](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-propagator-jaeger)
- "xray": [AWS X-Ray (third party)](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/propagators/propagator-aws-xray)
- "xray-lambda": [AWS X-Ray Lambda (third party)](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/propagators/propagator-aws-xray-lambda)
- "ottrace": [OT Trace (third party)](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/propagators/opentelemetry-propagator-ot-trace)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
[env-var-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/configuration/sdk-environment-variables.md#general-sdk-configuration
