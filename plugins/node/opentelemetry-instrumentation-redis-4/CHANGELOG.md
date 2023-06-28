# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.34.0 to ^0.35.0

## [0.34.6](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.5...instrumentation-redis-4-v0.34.6) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.3 to ^0.33.4

## [0.34.5](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.4...instrumentation-redis-4-v0.34.5) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.35.0 to ^0.35.1
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.2 to ^0.33.3

## [0.34.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.3...instrumentation-redis-4-v0.34.4) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.1 to ^0.33.2

## [0.34.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.1...instrumentation-redis-4-v0.34.2) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.0 to ^0.33.1

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.0...instrumentation-redis-4-v0.34.1) (2022-12-20)


### Bug Fixes

* **redis-4:** add support to new version of redis ([#1324](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1324)) ([378f130](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/378f130befb2bd8be42d367b9db5ae9329d57b5e))
* **redis:** serialize non sensitive arguments into db.statement attribute ([#1299](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1299)) ([092a250](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/092a2509bcf884e1b997e0eaec3a6ca02cfd2058))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.33.0 to ^0.34.0

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.33.1...instrumentation-redis-4-v0.34.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.32.0 to ^0.33.0

## [0.33.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.33.0...instrumentation-redis-4-v0.33.1) (2022-11-02)


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.32.0...instrumentation-redis-4-v0.33.0) (2022-09-15)


### Features

* add redis 4 connect span ([#1125](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1125)) ([dbf37fb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dbf37fb99b9168ebd0febc0da0ec21c0082e9967))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.31.0...instrumentation-redis-4-v0.32.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.30.0...instrumentation-redis-4-v0.31.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.29.0...instrumentation-redis-4-v0.30.0) (2022-05-25)


### Features

* **instrumentation-redis:** add support for redis@^4.0.0 ([#982](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/982)) ([1da0216](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1da0216180de694c15ec356d476f465811757ae4))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
