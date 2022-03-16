# Changelog

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.5.1...instrumentation-aws-sdk-v0.6.0) (2022-03-14)


### Features

* **aws-sdk:** lambda client instrumentation ([#916](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/916)) ([dc6c2b5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dc6c2b5121977814f854b674ec3e519f689637c9))

### [0.5.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.5.0...instrumentation-aws-sdk-v0.5.1) (2022-03-02)


### Bug Fixes

* **opentelemetry-instrumentation-aws-sdk:** error when ReturnConsumedCapacity is set to None ([#899](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/899)) ([e7ab4d0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e7ab4d056b6663f593b47af7c3e8014a72a963fe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.26.0 to ^0.27.0

## [0.5.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.4.0...instrumentation-aws-sdk-v0.5.0) (2022-01-24)


### Features

* **aws-sdk:** add http status code attribute to aws sdk span ([#844](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/844)) ([09b8555](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/09b8555007c3c05ad046dd67925f3640a7b35fbe))


### Bug Fixes

* **aws-sdk:** calc propagation fields count before context inject ([#738](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/738)) ([033cc1f](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/033cc1f7ed09c33e401b9514ed30d1160cf58899))
* **aws-sdk:** sns span name should be with low cardinality ([#841](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/841)) ([7032a33](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7032a33b6eef331ab327ab57b9bd3a1aed361fb2))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.4.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.3.1...instrumentation-aws-sdk-v0.4.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

### [0.3.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.3.0...instrumentation-aws-sdk-v0.3.1) (2021-11-30)


### Bug Fixes

* **aws-sdk:** sns-sqs extract the correct context key from message payload  ([#761](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/761)) ([e5cae76](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/e5cae76d90b5e6d2eb9c6cd5da984a07cdd5048c))

## [0.3.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.2.0...instrumentation-aws-sdk-v0.3.0) (2021-11-19)


### Features

* config option to extract sqs context from message payload ([#737](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/737)) ([28e2113](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/28e2113ec1091e73a1d1b62b48fee8c01c72afee))

## [0.2.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.1.0...instrumentation-aws-sdk-v0.2.0) (2021-11-12)


### Features

* AWS-SDK SNS Context propagation ([#728](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/728)) ([78cd4e1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/78cd4e118e5a41107d84dfd1ae8c4c28e885b27e))

## 0.1.0 (2021-10-22)


### Features

* **instrumentation-aws-sdk:** upstream aws-sdk instrumentation from ext-js ([#678](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/678)) ([f5851e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f5851e72512117dbce571a42930a90c560dbf63d))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.26.0 to ^0.27.0
