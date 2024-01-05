# Changelog

## [0.32.6](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.5...instrumentation-fastify-v0.32.6) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.0 to ^0.35.1

## [0.32.5](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.4...instrumentation-fastify-v0.32.5) (2023-12-07)


### Bug Fixes

* **instrumentation-fastify:** fix span attributes and avoid FSTDEP017 FastifyDeprecation warning for 404 request ([#1763](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1763)) ([18ae75c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/18ae75c6004d66744ee99be68469843372c19d1e))

## [0.32.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.3...instrumentation-fastify-v0.32.4) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))
* **instrumentation-fastify:** do not wrap preClose and onRequestAbort hooks ([#1764](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1764)) ([de6156a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/de6156aea1db7a7a018ad34f08cfc9f7ff7752b8))

## [0.32.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.2...instrumentation-fastify-v0.32.3) (2023-10-10)


### Bug Fixes

* **deps:** update all patch versions ([#1687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1687)) ([47301c0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47301c038e4dc7d24797cb0b8426033ecc0374e6))
* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))
* **fastify:** Use plugin name for middleware span name ([#1680](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1680)) ([4503d3e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4503d3efe98c0b440582101df69a6df49a6cdb97))
* **instrumentation-fastify:** add tav script ([#1710](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1710)) ([52dd42d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/52dd42d4748f6aef43988e62f464d95b808a06a6))
* Removed deprecated properties usage in Fastify instrumentation ([#1679](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1679)) ([d3328f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3328f8f55c6e3e2e7405a8e499d50555e9bec1a))

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.1...instrumentation-fastify-v0.32.2) (2023-08-30)


### Bug Fixes

* **fastify:** Make sure consturctor patching works with esm ([#1624](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1624)) ([67f66d2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/67f66d2e0e8ea9f5d9b46819d4f736fa1e0666b6))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.32.0...instrumentation-fastify-v0.32.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* **fastify:** readme option table format ([#1619](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1619)) ([3d6c7be](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3d6c7beffd7c1cc0ef99c7560bc21e01db28b431))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.31.4...instrumentation-fastify-v0.32.0) (2023-07-12)


### Features

* **fastify:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1569](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1569)) ([8d9687d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8d9687d89e4a80dbf2a5e8be6fb027ff20824593))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))
* **instrumentation-fastify:** fix fastify typescript compilation issue ([#1556](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1556)) ([784a422](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/784a4225182037b4233aefb43c7a104eab1ac818))

## [0.31.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.31.3...instrumentation-fastify-v0.31.4) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))

## [0.31.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.31.2...instrumentation-fastify-v0.31.3) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.31.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.31.1...instrumentation-fastify-v0.31.2) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.31.0...instrumentation-fastify-v0.31.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.30.1...instrumentation-fastify-v0.31.0) (2022-11-16)


### Features

* **fastify:** add requestHook support ([#1255](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1255)) ([c9923e3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c9923e3636649c67e5122531f164909b48dbb58d))
* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Bug Fixes

* **instrumentation-fastify:** stop using fastify types in public api ([#1267](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1267)) ([40515c3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/40515c3dca81d1c177d71af2663fce3b8813bbf2))

## [0.30.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.30.0...instrumentation-fastify-v0.30.1) (2022-11-02)


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.29.0...instrumentation-fastify-v0.30.0) (2022-09-27)


### Features

* **opentelemetry-instrumentation-fastify:** Support Fastify V4 also ([#1164](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1164)) ([d932d3e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d932d3edcbf41685ca0af546347450fa81444b4e))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.28.0...instrumentation-fastify-v0.29.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.27.0...instrumentation-fastify-v0.28.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.27.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.26.0...instrumentation-fastify-v0.27.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

## [0.26.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fastify-v0.25.0...instrumentation-fastify-v0.26.0) (2022-03-02)


### Features

* new fastify instrumentation ([#611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/611)) ([77c215b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/77c215bdd7adb76c8934028458a2b7f28e041f37))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
* use latest instrumentation base ([#769](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Bug Fixes

* fastify and browser autoinjection failed to compile ([#793](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/793)) ([c08efa8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c08efa82a38d3d5b4d0c51d712a39052317b9f74))
* typo in fastify description ([#891](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/891)) ([adbd6dc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/adbd6dcb0af6540a6d10b7e2ceaaf2c69a3e1146))
* update some dev-deps in fastify instrumentation ([a20f77b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a20f77b539d2a1eecc8a423d3b0381988e4734b8))
* use localhost for services in CI ([#816](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))
