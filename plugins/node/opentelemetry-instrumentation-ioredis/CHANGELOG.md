# Changelog

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.30.0...instrumentation-ioredis-v0.31.0) (2022-06-17)


### Features

* **ioredis:** only serialize non sensitive arguments in db statement attribute ([#1052](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1052)) ([375dfe0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/375dfe07bcd88b8cfb0e6dc291dcc9fd3fba2f9e))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.29.0...instrumentation-ioredis-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.28.0...instrumentation-ioredis-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.27.1...instrumentation-ioredis-v0.28.0) (2022-03-02)


### ⚠ BREAKING CHANGES

* **ioredis:** net.peer.ip -> db.connection_string

### Bug Fixes

* **ioredis:** net.peer.ip -> db.connection_string ([986c349](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/986c3499b324ebdf49aabf35bc3711c91bb91ec8))

### [0.27.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.27.0...instrumentation-ioredis-v0.27.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.26.0...instrumentation-ioredis-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.25.0...instrumentation-ioredis-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))


### Bug Fixes

* Add support for setConfig in ioredis instrumentation ([#689](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/689)) ([314c890](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/314c89050a2db231047914f2052eda689b49333c))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.25.0 to ^0.27.0
