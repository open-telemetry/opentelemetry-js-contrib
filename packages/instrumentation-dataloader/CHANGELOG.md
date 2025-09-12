# Changelog

## [0.23.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.22.0...instrumentation-dataloader-v0.23.0) (2025-09-10)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#3034](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3034)) ([bee0a66](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bee0a66ef825145fb1a9b172c3468ccf0c97a820))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.50.0 to ^0.51.0

## [0.22.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.21.1...instrumentation-dataloader-v0.22.0) (2025-09-08)


### Features

* **deps:** update otel deps ([#3027](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3027)) ([fd9e262](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd9e262fabf4e8fd8e246b8967892fa26442968a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.49.0 to ^0.50.0

## [0.21.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.21.0...instrumentation-dataloader-v0.21.1) (2025-08-13)


### Bug Fixes

* **instrumentation-dataloader:** support ESM imports of dataloader module ([#2973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2973)) ([16979f6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/16979f6f4a9f1def110195c3d29300f691038921))

## [0.21.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.20.0...instrumentation-dataloader-v0.21.0) (2025-07-09)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2930](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2930)) ([e4ab2a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e4ab2a932084016f9750bd09d3f9a469c44628ea))

## [0.20.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.19.0...instrumentation-dataloader-v0.20.0) (2025-07-04)


### Features

* **instrumentation-dataloader:** Enhance `dataloader` instrumentation. ([#2449](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2449)) ([5909ad4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5909ad49d6ad5b1364b3b62e1593b918931b7ba6))


### Bug Fixes

* **instrumentation-dataloader:** Patch `batchLoadFn` without creating an instance ([#2498](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2498)) ([b6d293a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b6d293ae3854b23017adaab0a936409e4951f9a7))

## [0.19.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.18.0...instrumentation-dataloader-v0.19.0) (2025-06-02)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2871](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2871)) ([d33c6f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d33c6f232a3c5673e618fa62692d2d3bbfe4c0fc))

## [0.18.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.17.0...instrumentation-dataloader-v0.18.0) (2025-05-15)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2828](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2828)) ([59c2a4c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59c2a4c002992518da2d91b4ceb24f8479ad2346))

## [0.17.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.16.1...instrumentation-dataloader-v0.17.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Bug Fixes

* **deps:** update otel core experimental to ^0.57.2 ([#2716](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2716)) ([d2a9a20](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d2a9a20f1cd8c46c842e18490a4eba36fd71c2da))


### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [0.16.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.16.0...instrumentation-dataloader-v0.16.1) (2025-02-19)


### Bug Fixes

* **deps:** update all patch versions ([#2413](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2413)) ([1a55420](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1a55420d8c00ca998b57270df77857c48ebbe8d7))
* **deps:** update otel core experimental to ^0.57.1 ([#2687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2687)) ([5e20fe2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5e20fe2f450a1be4ea100e8a6d196e33ccff0cda))

## [0.16.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.15.0...instrumentation-dataloader-v0.16.0) (2024-12-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2608](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2608)) ([aa46705](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa46705d2fd1bd5ee6d763ac8cd73a7630889d34))

## [0.15.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.14.0...instrumentation-dataloader-v0.15.0) (2024-12-04)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2582)) ([5df02cb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5df02cbb35681d2b5cce359dda7b023d7bf339f2))

## [0.14.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.13.0...instrumentation-dataloader-v0.14.0) (2024-11-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2535](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2535)) ([5223a6c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5223a6ca10c5930cf2753271e1e670ae682d6d9c))

## [0.13.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.12.0...instrumentation-dataloader-v0.13.0) (2024-10-25)


### Features

* update "@opentelemetry/*" dependencies to 1.27.0/0.54.0 ([2822511](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2822511a8acffb875ebd67ff2cf95980a9ddc01e))

## [0.12.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.11.0...instrumentation-dataloader-v0.12.0) (2024-09-02)


### Features

* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))

## [0.11.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.10.0...instrumentation-dataloader-v0.11.0) (2024-07-03)


### ⚠ BREAKING CHANGES

* export instrumentations only as named export ([#2296](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2296))
* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196))

### Bug Fixes

* export instrumentations only as named export ([#2296](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2296)) ([0ed4038](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0ed40384287a8d06549c2a9c98a26ea9b068c472))
* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196)) ([01c28ae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/01c28ae016ed32f9968e52bc91e3e3700dcef82e))

## [0.10.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.9.0...instrumentation-dataloader-v0.10.0) (2024-06-06)


### Features

* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))

## [0.9.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.8.0...instrumentation-dataloader-v0.9.0) (2024-04-25)


### Features

* **deps:** update otel-js to 0.51.0 ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
* remove generic type from instrumentations ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.8.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.7.0...instrumentation-dataloader-v0.8.0) (2024-04-03)


### Features

* **deps:** update otel-js to 1.23.0/0.50.0 ([#2076](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2076)) ([d5f079b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d5f079b3992395dcfb3b791c9fdaeefd6d6526f8))

## [0.7.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.6.0...instrumentation-dataloader-v0.7.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.5.4...instrumentation-dataloader-v0.6.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))

## [0.5.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.5.3...instrumentation-dataloader-v0.5.4) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))

## [0.5.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.5.2...instrumentation-dataloader-v0.5.3) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))

## [0.5.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.5.1...instrumentation-dataloader-v0.5.2) (2023-10-10)


### Bug Fixes

* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))

## [0.5.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.5.0...instrumentation-dataloader-v0.5.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.4.3...instrumentation-dataloader-v0.5.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))

## [0.4.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.4.2...instrumentation-dataloader-v0.4.3) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))

## [0.4.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.4.1...instrumentation-dataloader-v0.4.2) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.4.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.4.0...instrumentation-dataloader-v0.4.1) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.3.1...instrumentation-dataloader-v0.4.0) (2023-02-14)


### Features

* **instrumentation-dataloader:** add dataloader name to span names ([#1345](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1345)) ([712b559](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/712b559416e0d86ef29ed06d46c180ef8360b411))

## [0.3.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.3.0...instrumentation-dataloader-v0.3.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.2.1...instrumentation-dataloader-v0.3.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.2.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.2.0...instrumentation-dataloader-v0.2.1) (2022-11-02)


### Bug Fixes

* remove types of the instrumented libs form public apis ([#1221](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1221)) ([682d610](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/682d6107b7285829bb72e592936c585ccdfab16a))
* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.1.0...instrumentation-dataloader-v0.2.0) (2022-09-27)


### Features

* add dataloader instrumentation ([#1171](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1171)) ([3898b11](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3898b11800f857c75c286f22c4633b5baf4e1f84))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))

## Changelog
