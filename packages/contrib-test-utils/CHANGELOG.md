# Changelog

## [0.49.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.48.0...contrib-test-utils-v0.49.0) (2025-07-09)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2930](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2930)) ([e4ab2a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e4ab2a932084016f9750bd09d3f9a469c44628ea))

## [0.48.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.47.0...contrib-test-utils-v0.48.0) (2025-06-02)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2871](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2871)) ([d33c6f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d33c6f232a3c5673e618fa62692d2d3bbfe4c0fc))

## [0.47.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.46.0...contrib-test-utils-v0.47.0) (2025-05-15)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2828](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2828)) ([59c2a4c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59c2a4c002992518da2d91b4ceb24f8479ad2346))
* **oracledb:** Add support for Oracle DB instrumentation ([#2612](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2612)) ([e8e3cbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e8e3cbdadf439c5bd16dfe5d6fc0714fe0e8235a))


### Bug Fixes

* **pg:** fix instrumentation of ESM-imported pg-pool ([#2807](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2807)) ([f6bc4cc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f6bc4ccca0bf3469aa55f225192fedcae432d41f)), closes [#2759](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2759)

## [0.46.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.45.1...contrib-test-utils-v0.46.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Bug Fixes

* **deps:** update otel core experimental to ^0.57.2 ([#2716](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2716)) ([d2a9a20](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d2a9a20f1cd8c46c842e18490a4eba36fd71c2da))


### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [0.45.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.45.0...contrib-test-utils-v0.45.1) (2025-02-19)


### Bug Fixes

* **deps:** update otel core experimental to ^0.57.1 ([#2687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2687)) ([5e20fe2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5e20fe2f450a1be4ea100e8a6d196e33ccff0cda))

## [0.45.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.44.0...contrib-test-utils-v0.45.0) (2024-12-18)


### Features

* **contrib-test-utils:** copy soon-to-be-removed types from @opentelemetry/otlp-transformer ([#2573](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2573)) ([23a345d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/23a345dbfbf99569250a5194e403b98c9385fca9))
* **deps:** update deps matching '@opentelemetry/*' ([#2608](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2608)) ([aa46705](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa46705d2fd1bd5ee6d763ac8cd73a7630889d34))


### Bug Fixes

* **test-utils:** Don't swallow assertion errors from `checkResult` and `checkCollector` ([#2588](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2588)) ([de679ad](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/de679ad46d16019abdea79c48c7fb1f9635a8ad5))

## [0.44.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.43.0...contrib-test-utils-v0.44.0) (2024-12-04)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2582)) ([5df02cb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5df02cbb35681d2b5cce359dda7b023d7bf339f2))

## [0.43.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.42.0...contrib-test-utils-v0.43.0) (2024-11-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2535](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2535)) ([5223a6c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5223a6ca10c5930cf2753271e1e670ae682d6d9c))

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.41.0...contrib-test-utils-v0.42.0) (2024-10-25)


### Features

* update "@opentelemetry/*" dependencies to 1.27.0/0.54.0 ([2822511](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2822511a8acffb875ebd67ff2cf95980a9ddc01e))

## [0.41.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.40.0...contrib-test-utils-v0.41.0) (2024-09-02)


### Features

* **opentelemetry-test-utils:** export class TestMetricReader ([7054bc1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7054bc14001843d32b2cc044ebc77caa3c94d1dd))
* **opentelemetry-test-utils:** export class TestMetricReader ([7e27039](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7e270395feca8a1b9a703491b189df41bcef5b79))
* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.39.0...contrib-test-utils-v0.40.0) (2024-06-06)


### Features

* **instr-tedious:** add support for v16 and v17 ([#2178](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2178)) ([8c578cd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8c578cd17b25b33390e4237596b9e5cbbc0d0b6d)), closes [#1656](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1656)
* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.38.0...contrib-test-utils-v0.39.0) (2024-04-25)


### Features

* **deps:** update otel-js to 0.51.0 ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
* remove generic type from instrumentations ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.37.0...contrib-test-utils-v0.38.0) (2024-04-03)


### Features

* **deps:** update otel-js to 1.23.0/0.50.0 ([#2076](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2076)) ([d5f079b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d5f079b3992395dcfb3b791c9fdaeefd6d6526f8))

## [0.37.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.36.0...contrib-test-utils-v0.37.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.35.1...contrib-test-utils-v0.36.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))

## [0.35.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.35.0...contrib-test-utils-v0.35.1) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.34.3...contrib-test-utils-v0.35.0) (2023-11-22)


### Features

* **test-utils:** runTestFixture utility for running out-of-process tests ([#1735](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1735)) ([4c8b374](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8b37453225769ec5f7b3c97a2bf0de673bc60f))

## [0.34.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.34.2...contrib-test-utils-v0.34.3) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))

## [0.34.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.34.1...contrib-test-utils-v0.34.2) (2023-10-10)


### Bug Fixes

* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.34.0...contrib-test-utils-v0.34.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.33.4...contrib-test-utils-v0.34.0) (2023-07-12)


### Features

* add sqlcommenter comment to mysql2 queries ([#1523](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1523)) ([856c252](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/856c25211567104ced8b2a2b56d0818a3c48e671))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))

## [0.33.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.33.3...contrib-test-utils-v0.33.4) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))

## [0.33.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.33.2...contrib-test-utils-v0.33.3) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.33.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.33.1...contrib-test-utils-v0.33.2) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.33.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.33.0...contrib-test-utils-v0.33.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.32.0...contrib-test-utils-v0.33.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.31.0...contrib-test-utils-v0.32.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.30.0...contrib-test-utils-v0.31.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.29.0...contrib-test-utils-v0.30.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

## [0.29.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.28.0...contrib-test-utils-v0.29.0) (2022-01-24)


### Features

* implement instrumentation for `tedious` ([#799](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/799)) ([9326c99](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/9326c99f3cdf3e0166f74093a8093066be78bd0a))
* re-enable TAV ([#823](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/823)) ([2e14f46](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/2e14f46b3f7221ae51ffa12313997f007c300e21))


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.27.0...contrib-test-utils-v0.28.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.26.0...contrib-test-utils-v0.27.0) (2021-10-22)


### Features

* **instrumentation-aws-sdk:** upstream aws-sdk instrumentation from ext-js ([#678](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/678)) ([f5851e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f5851e72512117dbce571a42930a90c560dbf63d))
* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.25.0...contrib-test-utils-v0.26.0) (2021-09-22)


### Features

* upstream mocha instrumentation testing plugin from ext-js ([@blumamir](https://www.github.com/blumamir)) [#621](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#670](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/670)) ([7edf984](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7edf98425d77aaa1d74a959195e87b6079daabcd))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
