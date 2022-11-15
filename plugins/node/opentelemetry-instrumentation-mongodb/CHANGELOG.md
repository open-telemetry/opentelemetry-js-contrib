# Changelog

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.32.1...instrumentation-mongodb-v0.32.2) (2022-11-02)


### Bug Fixes

* **mongodb:** use net.peer namespace for mongo host and port ([#1257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1257)) ([c63d2a4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c63d2a4206b8d4ba0fb337b253ff6c84f0814a09))
* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.32.0...instrumentation-mongodb-v0.32.1) (2022-09-27)


### Bug Fixes

* remove unneeded type exports in mongodb instrumentation ([#1194](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1194)) ([6920a55](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6920a554b46bf8af5e00b60073d479feacb18dcd))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.31.1...instrumentation-mongodb-v0.32.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Bug Fixes

* mongodb types fails to compile with latest tsc v4.8 ([#1141](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1141)) ([ec9ee13](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ec9ee131635dc2db88deea4f2efb887ff6f60577))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.31.0...instrumentation-mongodb-v0.31.1) (2022-08-09)


### Bug Fixes

* mongodb unwrapping ([#1089](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1089)) ([1db1fec](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1db1fecc16ecb3dbad530de530418260e54c087a))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.30.0...instrumentation-mongodb-v0.31.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.29.0...instrumentation-mongodb-v0.30.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* skip mongodb TAV runs on node 8 and 10 ([#949](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/949)) ([00b1a94](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/00b1a9472ed21f6dfe427543a407e559b1cfe08a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.28.0...instrumentation-mongodb-v0.29.0) (2022-03-02)


### Features

* **mongodb4:** added mongodb4 instrumentation ([#869](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/869)) ([47700e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47700e10dc6e4bd9ba0255cae85dec07ab4dd448))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.27.0...instrumentation-mongodb-v0.28.0) (2022-01-24)


### Features

* re-enable TAV ([#823](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/823)) ([2e14f46](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/2e14f46b3f7221ae51ffa12313997f007c300e21))


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.26.0...instrumentation-mongodb-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.25.0...instrumentation-mongodb-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))


### Bug Fixes

* **opentelemetry-instrumentation-mongodb:** fix span attributes with unified topology ([#663](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/663)) ([aeadca8](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/aeadca8da626164828852489ab749dfd0aa1d981))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.26.0 to ^0.27.0
