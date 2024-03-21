# Changelog

### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.3 to ^0.35.0

## [0.39.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.39.0...instrumentation-pg-v0.39.1) (2024-03-11)


### Bug Fixes

* **instrumentation-pg:** prevent net.peer.port from being NaN ([#1982](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1982)) ([3b2090b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3b2090b5f53ee56e8d06ef7c144588141080804c))

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.38.0...instrumentation-pg-v0.39.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.36.0 to ^0.37.0

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.37.2...instrumentation-pg-v0.38.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))


### Bug Fixes

* **instrumentation-pg:** remove `@opentelemetry/core` from dependencies ([#1895](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1895)) ([c0d873c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c0d873c360c00cd81a7c2ced74683f8408eabd84))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.1 to ^0.36.0

## [0.37.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.37.1...instrumentation-pg-v0.37.2) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.0 to ^0.35.1

## [0.37.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.36.2...instrumentation-pg-v0.37.0) (2023-11-13)


### Features

* additional instrumentation debug diagnostics ([#1777](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1777)) ([adbe86d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/adbe86db3a5c7096fdf2fd8cc5ade700ed022a7b))


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))
* **pg:** fix instrumentation of ESM-imported pg ([#1701](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1701)) ([2502e18](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2502e18e03ed8796679349a534100d743dc639e6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.2 to ^0.34.3

## [0.36.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.36.1...instrumentation-pg-v0.36.2) (2023-10-10)


### Bug Fixes

* **deps:** update all patch versions ([#1687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1687)) ([47301c0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47301c038e4dc7d24797cb0b8426033ecc0374e6))
* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.1 to ^0.34.2

## [0.36.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.36.0...instrumentation-pg-v0.36.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.0 to ^0.34.1

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.35.3...instrumentation-pg-v0.36.0) (2023-07-12)


### Features

* add sqlcommenter comment to mysql2 queries ([#1523](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1523)) ([856c252](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/856c25211567104ced8b2a2b56d0818a3c48e671))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/sql-common bumped from ^0.39.0 to ^0.40.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.4 to ^0.34.0

## [0.35.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.35.2...instrumentation-pg-v0.35.3) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.3 to ^0.33.4

## [0.35.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.35.1...instrumentation-pg-v0.35.2) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))
* **pg-values:** values should be parsable when enhancedDatabaseRepoting:true ([#1453](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1453)) ([49a0389](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/49a03892c05dbeda98badeb07847240869442384))
* **pg:** do not replace argument with plain object ([#1432](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1432)) ([e691537](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e6915373aaa8c1226f6dc122b49ae6bfb2fc1ddd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.2 to ^0.33.3

## [0.35.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.35.0...instrumentation-pg-v0.35.1) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.1 to ^0.33.2

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.34.1...instrumentation-pg-v0.35.0) (2023-03-03)


### Features

* **pg:** remove support for pg v7 ([#1393](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1393)) ([ae6d4f3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ae6d4f39fc882d16e65e846218a69fb72586de3e))


### Bug Fixes

* **postgres:** pass 'arguments' to the connect callback ([#1395](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1395)) ([b02775f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b02775f0d9e84dea5463bb9a3883d0ad6ff1f500))

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
