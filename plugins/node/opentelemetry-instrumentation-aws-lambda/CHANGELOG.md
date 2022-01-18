# Changelog

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.27.0...instrumentation-aws-lambda-v0.28.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.26.0...instrumentation-aws-lambda-v0.27.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))


### Bug Fixes

* prevent invalid context propagation in lambda functions ([#677](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/677)) ([25c0e30](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/25c0e30d34faf3f27edcfb330874f54e4db03f59))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^0.24.0 to ^1.0.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.25.0...instrumentation-aws-lambda-v0.26.0) (2021-09-22)


### Features

* upstream mocha instrumentation testing plugin from ext-js [#621](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))


### Bug Fixes

* **aws-lambda:** BasicTracerProvider not force flushing ([#661](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/661)) ([76e0d0f](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/76e0d0fbef59e84c42b52d37cb3541e0dc853eb6))
* Update aws-lambda-instrumentation to SDK v0.25.0 ([#660](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/660)) ([7b0d090](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7b0d0900bfb8475a32d799add4d925d7addbb24d))
