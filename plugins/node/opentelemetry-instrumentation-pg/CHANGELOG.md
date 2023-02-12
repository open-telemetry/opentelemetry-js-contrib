# Changelog

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.34.0...instrumentation-pg-v0.34.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))
* **pg:** update requireParentSpan to skip instrumentation when parent not present ([#1343](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1343)) ([d23c329](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d23c329a1581709ddc0f336fddfa1aa930f90c3f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.0 to ^0.33.1

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.33.0...instrumentation-pg-v0.34.0) (2022-12-20)


### Features

* add sqlcommenter comment with trace context to queries in pg instrumentation ([#1286](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1286)) ([a0003e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a0003e76fc46afbbee2558a7d21906be7c9cb1d1))
* **pg:** support requestHook hook ([#1307](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1307)) ([f0a9368](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f0a93685cfb43543b7ca577dd370d56576b49e3f))


### Bug Fixes

* pg span names ([#1306](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1306)) ([8a375f5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8a375f59f3043a7d3749b1e8af5603b9ed30f08f))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.32.0...instrumentation-pg-v0.33.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.32.0 to ^0.33.0

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.31.1...instrumentation-pg-v0.32.0) (2022-11-02)


### Features

* **pg:** add requireParentSpan option ([#1199](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1199)) ([a6f054d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a6f054de256acc3415deb8137c7ea4bd6926c08d))


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.31.0...instrumentation-pg-v0.31.1) (2022-09-15)


### Bug Fixes

* **pg:** avoid disjoint spans from pg instrumentation ([#1122](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1122)) ([82b8a84](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/82b8a8490628282efba334cb19f43bb6bf796548))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.30.0...instrumentation-pg-v0.31.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.29.0...instrumentation-pg-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.28.0...instrumentation-pg-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.27.0...instrumentation-pg-v0.28.0) (2022-01-24)


### Features

* re-enable TAV ([#823](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/823)) ([2e14f46](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/2e14f46b3f7221ae51ffa12313997f007c300e21))


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.26.0...instrumentation-pg-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.25.0...instrumentation-pg-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.25.0 to ^0.27.0
