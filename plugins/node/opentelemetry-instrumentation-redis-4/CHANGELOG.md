# Changelog

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.34.0 to ^0.35.0

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.3 to ^0.35.0

## [0.35.6](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.35.5...instrumentation-redis-4-v0.35.6) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.0 to ^0.35.1

## [0.35.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.35.3...instrumentation-redis-4-v0.35.4) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.2 to ^0.34.3

## [0.35.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.35.2...instrumentation-redis-4-v0.35.3) (2023-10-13)


### Bug Fixes

* **instrumentation-redis-4:** avoid shimmer warning by only wrapping multi/MULTI if they exist ([#1729](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1729)) ([247a81c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/247a81c047264ba638abb9a2ef2ca14801094040))
* **instrumentation-redis-4:** fix unhandledRejection in client.multi(...) handling ([#1730](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1730)) ([d953531](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d95353179279e3cf35ec37b6ca18f1e920691e16))

## [0.35.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.35.1...instrumentation-redis-4-v0.35.2) (2023-10-10)


### Bug Fixes

* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.1 to ^0.34.2

## [0.35.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.35.0...instrumentation-redis-4-v0.35.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* **redis-4:** omit credentials from db.connection_string span attribute ([#1562](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1562)) ([ccf1efe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ccf1efe0cf8f144ab0d0aab490dfff499bd3158e))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.36.0 to ^0.36.1
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.0 to ^0.34.1

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-4-v0.34.6...instrumentation-redis-4-v0.35.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.35.1 to ^0.36.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.4 to ^0.34.0

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
