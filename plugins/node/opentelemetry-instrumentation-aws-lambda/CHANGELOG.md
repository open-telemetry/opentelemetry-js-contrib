# Changelog

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.31.0...instrumentation-aws-lambda-v0.32.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.30.0...instrumentation-aws-lambda-v0.31.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from 1.0.1 to ^1.1.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.29.0...instrumentation-aws-lambda-v0.30.0) (2022-03-14)


### Features

* support baggage propagation in aws lambda custom context extraction ([#843](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/843)) ([da792fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/da792fe3c629354cf9e8faeca48c17e73dffc6be))

## [0.29.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.28.1...instrumentation-aws-lambda-v0.29.0) (2022-02-06)


### Features

* support using lambda context in the aws lambda context extractor ([#860](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/860)) ([5cb3266](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/5cb3266773f3f66d02af3306ae7332288bcae6af))

### [0.28.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.28.0...instrumentation-aws-lambda-v0.28.1) (2022-01-24)


### Bug Fixes

* fix CI by forcing colors@1.4.0 ([#825](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/825)) ([0ec9f08](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/0ec9f080520fe0f146a915a656300ef53a151ace))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.0.0 to ^1.0.1

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
