# Changelog

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.31.1...instrumentation-mysql2-v0.32.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.31.0...instrumentation-mysql2-v0.31.1) (2022-08-09)


### Bug Fixes

* avoid type imports of the instrumented package in the built assets ([#1017](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1017)) ([e265723](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e2657232c9007a77ddc873a93e8247f99087b9c1))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.30.0...instrumentation-mysql2-v0.31.0) (2022-06-08)


### Features

* **mysql2:** support Connection.execute ([#1028](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1028)) ([3e2f9c5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3e2f9c56f4a748a5e63f2f054ec67d5db4b646ab))
* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.29.0...instrumentation-mysql2-v0.30.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.28.0...instrumentation-mysql2-v0.29.0) (2022-03-02)


### ⚠ BREAKING CHANGES

* **mysql*,redis:** net.peer.ip -> db.connection_string

### Features

* add mysql2 responsehook ([#915](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/915)) ([f436601](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4366015e2a628efc4cb8a47d508ba5620175f88))
* support mysql2 v1 ([#908](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/908)) ([d3883d3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3883d38b7cf929404cf4eac9a9a48b7d1f4327f))


### Bug Fixes

* **mysql*,redis:** net.peer.ip -> db.connection_string ([bf39b90](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bf39b908fd64cec92c862b2deca5d760ddcf4509))
* use SQL verb for mysql2 span name when query object is used ([#923](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/923)) ([3d1388b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3d1388b0f779417de86b5b9af84d9000c7f67782))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.27.0...instrumentation-mysql2-v0.28.0) (2022-01-24)


### Features

* re-enable TAV ([#823](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/823)) ([2e14f46](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/2e14f46b3f7221ae51ffa12313997f007c300e21))


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.26.0...instrumentation-mysql2-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.25.0...instrumentation-mysql2-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.25.0 to ^0.27.0
