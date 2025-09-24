<!-- markdownlint-disable MD007 MD034 -->
# Changelog

## [0.58.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.58.0...instrumentation-mongodb-v0.58.1) (2025-09-24)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.51.0 to ^0.52.0

## [0.58.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.57.0...instrumentation-mongodb-v0.58.0) (2025-09-10)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#3034](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3034)) ([bee0a66](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bee0a66ef825145fb1a9b172c3468ccf0c97a820))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.50.0 to ^0.51.0

## [0.57.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.56.0...instrumentation-mongodb-v0.57.0) (2025-09-08)


### Features

* **deps:** update otel deps ([#3027](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3027)) ([fd9e262](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd9e262fabf4e8fd8e246b8967892fa26442968a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.49.0 to ^0.50.0

## [0.56.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.55.1...instrumentation-mongodb-v0.56.0) (2025-07-09)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2930](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2930)) ([e4ab2a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e4ab2a932084016f9750bd09d3f9a469c44628ea))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.48.0 to ^0.49.0

## [0.55.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.55.0...instrumentation-mongodb-v0.55.1) (2025-06-05)


### Bug Fixes

* incorrect export of enums ([#2876](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2876)) ([a81ef5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a81ef5fc4dfe3231c225b3969e3644dedeb4ca91))

## [0.55.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.54.0...instrumentation-mongodb-v0.55.0) (2025-06-02)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2871](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2871)) ([d33c6f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d33c6f232a3c5673e618fa62692d2d3bbfe4c0fc))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.47.0 to ^0.48.0

## [0.54.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.53.0...instrumentation-mongodb-v0.54.0) (2025-05-15)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2828](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2828)) ([59c2a4c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59c2a4c002992518da2d91b4ceb24f8479ad2346))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.46.0 to ^0.47.0

## [0.53.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.52.0...instrumentation-mongodb-v0.53.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Bug Fixes

* **deps:** update otel core experimental to ^0.57.2 ([#2716](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2716)) ([d2a9a20](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d2a9a20f1cd8c46c842e18490a4eba36fd71c2da))


### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.45.1 to ^0.46.0

## [0.52.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.51.0...instrumentation-mongodb-v0.52.0) (2025-02-19)


### Features

* **instrumentation-mongodb:** Add `requireParentSpan` config option. ([#2658](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2658)) ([2989b94](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2989b94515ca6f62b628f63eeb881f4b91e391af))


### Bug Fixes

* **deps:** update otel core experimental to ^0.57.1 ([#2687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2687)) ([5e20fe2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5e20fe2f450a1be4ea100e8a6d196e33ccff0cda))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.45.0 to ^0.45.1

## [0.51.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.50.0...instrumentation-mongodb-v0.51.0) (2024-12-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2608](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2608)) ([aa46705](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa46705d2fd1bd5ee6d763ac8cd73a7630889d34))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.44.0 to ^0.45.0

## [0.50.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.49.0...instrumentation-mongodb-v0.50.0) (2024-12-04)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2582)) ([5df02cb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5df02cbb35681d2b5cce359dda7b023d7bf339f2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.43.0 to ^0.44.0

## [0.49.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.48.0...instrumentation-mongodb-v0.49.0) (2024-11-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2535](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2535)) ([5223a6c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5223a6ca10c5930cf2753271e1e670ae682d6d9c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.42.0 to ^0.43.0

## [0.48.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.47.0...instrumentation-mongodb-v0.48.0) (2024-10-25)


### Features

* update "@opentelemetry/*" dependencies to 1.27.0/0.54.0 ([2822511](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2822511a8acffb875ebd67ff2cf95980a9ddc01e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.41.0 to ^0.42.0

## [0.47.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.46.0...instrumentation-mongodb-v0.47.0) (2024-09-02)


### Features

* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.40.0 to ^0.41.0

## [0.46.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.45.0...instrumentation-mongodb-v0.46.0) (2024-07-03)


### ⚠ BREAKING CHANGES

* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196))

### Bug Fixes

* **instr-mongodb:** fix  function patch missing one argument introduced in v6.8.0 ([#2314](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2314)) ([9dc55da](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9dc55da3b856e6bc147d59547582f0bf056384a1))
* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196)) ([01c28ae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/01c28ae016ed32f9968e52bc91e3e3700dcef82e))

## [0.45.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.44.0...instrumentation-mongodb-v0.45.0) (2024-06-10)


### Features

* **instrumentation-mongodb:** support aggregation commands and support nested statements ([#1728](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1728)) ([2b1360d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2b1360daea5254d15c7dba71c30748630d92c17f))

## [0.44.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.43.0...instrumentation-mongodb-v0.44.0) (2024-06-06)


### Features

* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.39.0 to ^0.40.0

## [0.43.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.42.0...instrumentation-mongodb-v0.43.0) (2024-04-25)


### Features

* **deps:** update otel-js to 0.51.0 ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
* remove generic type from instrumentations ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.38.0 to ^0.39.0

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.41.0...instrumentation-mongodb-v0.42.0) (2024-04-03)


### Features

* **deps:** update otel-js to 1.23.0/0.50.0 ([#2076](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2076)) ([d5f079b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d5f079b3992395dcfb3b791c9fdaeefd6d6526f8))


### Bug Fixes

* **instr-mongodb:** `mongodb` &gt;=v6.4.0 support ([#2001](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2001)) ([20328d4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/20328d4a655b41b7f5546137c90dbdce1cce4e14)), closes [#1983](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1983)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.37.0 to ^0.38.0

## [0.41.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.40.0...instrumentation-mongodb-v0.41.0) (2024-03-11)


### ⚠ BREAKING CHANGES

* **instrumentation-mongodb:** temporarily reduce supported range to mongodb <6.4 ([#1984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1984))

### Bug Fixes

* **instrumentation-mongodb:** temporarily reduce supported range to mongodb &lt;6.4 ([#1984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1984)) ([2d3bb52](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2d3bb52762a637a4d0d0c14ff254eebc4fbbd508))

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.39.0...instrumentation-mongodb-v0.40.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))


### Bug Fixes

* **instrumentation-memcached:** parse attribute value for net.peer.port to a number ([038e0bf](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/038e0bfda951055ce91724a3b4a3042a9f918700))
* **instrumentation-mongodb:** parse attribute value for net.peer.port to a number ([038e0bf](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/038e0bfda951055ce91724a3b4a3042a9f918700))
* **instrumentation-mysql2:** parse attribute value for net.peer.port to a number ([038e0bf](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/038e0bfda951055ce91724a3b4a3042a9f918700))
* **instrumentation-mysql:** parse attribute value for net.peer.port to a number ([038e0bf](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/038e0bfda951055ce91724a3b4a3042a9f918700))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.36.0 to ^0.37.0

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.38.1...instrumentation-mongodb-v0.39.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))


### Bug Fixes

* **mongodb-example:** Ensure instrumentation is setup before mongoDB client is import ([#1851](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1851)) ([c54e9b6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c54e9b61a031469110d845387ae1853b9197063d))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.1 to ^0.36.0

## [0.38.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.38.0...instrumentation-mongodb-v0.38.1) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.0 to ^0.35.1

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.37.3...instrumentation-mongodb-v0.38.0) (2023-12-07)


### Features

* **instrumentation-mongodb:** add support for mongodb v6 ([#1760](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1760)) ([660e37b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/660e37bb67509b2fdd5cdd814dad2e60aa0ab40b))

## [0.37.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.37.1...instrumentation-mongodb-v0.37.2) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))
* fix context loss when cursor are accesed concurrently ([#1721](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1721)) ([1dc2e81](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1dc2e815edf81bd0b691639fcb5ba36766e1ec3f))
* use context API to bind connection checkOut callback ([#1766](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1766)) ([229b1f7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/229b1f78e847000cb3c24692423bd505dc994ddf))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.2 to ^0.34.3

## [0.37.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.37.0...instrumentation-mongodb-v0.37.1) (2023-10-10)


### Bug Fixes

* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.1 to ^0.34.2

## [0.37.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.36.1...instrumentation-mongodb-v0.37.0) (2023-08-30)


### ⚠ BREAKING CHANGES

* **mongodb:** removes the broken exported type `V4Connection`.

### Bug Fixes

* **mongodb:** remove broken type export `V4Connection` ([#1644](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1644)) ([ff29576](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff29576ce9eaeed3681a9bcbd2f84668c396e5fd)), closes [#1639](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1639)

## [0.36.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.36.0...instrumentation-mongodb-v0.36.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.0 to ^0.34.1

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.35.0...instrumentation-mongodb-v0.36.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))
* **mongodb:** support v5 ([#1451](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1451)) ([05c4e9e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/05c4e9ee3e740b3bfba609b3e8a4c02ca7119a1c))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.4 to ^0.34.0

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.34.3...instrumentation-mongodb-v0.35.0) (2023-06-12)


### Features

* **mongodb:** collect mongodb4 metrics ([#1170](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1170)) ([988e1f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/988e1f8ea5fbce055d8ef73e40827f750da935d6))


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.3 to ^0.33.4

## [0.34.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.34.2...instrumentation-mongodb-v0.34.3) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.2 to ^0.33.3

## [0.34.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.34.1...instrumentation-mongodb-v0.34.2) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.1 to ^0.33.2

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.34.0...instrumentation-mongodb-v0.34.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.0 to ^0.33.1

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.33.0...instrumentation-mongodb-v0.34.0) (2022-12-20)


### Features

* **mongodb:** add db.operation span attribute ([#1321](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1321)) ([97305e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/97305e1880ecbfb3b87d6c38f0c6521570583510))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.32.2...instrumentation-mongodb-v0.33.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.32.0 to ^0.33.0

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
