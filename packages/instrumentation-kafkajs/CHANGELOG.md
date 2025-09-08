# Changelog

## [0.14.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.13.0...instrumentation-kafkajs-v0.14.0) (2025-09-08)


### Features

* **deps:** update otel deps ([#3027](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3027)) ([fd9e262](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd9e262fabf4e8fd8e246b8967892fa26442968a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.49.0 to ^0.50.0

## [0.13.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.12.0...instrumentation-kafkajs-v0.13.0) (2025-08-13)


### Features

* **kafkajs:** instrument transaction send and sendBatch ([#2939](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2939)) ([c0593e6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c0593e65a6d74425a0922e358e4fd235e7112148))

## [0.12.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.11.0...instrumentation-kafkajs-v0.12.0) (2025-07-09)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2930](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2930)) ([e4ab2a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e4ab2a932084016f9750bd09d3f9a469c44628ea))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.48.0 to ^0.49.0

## [0.11.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.10.0...instrumentation-kafkajs-v0.11.0) (2025-06-02)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2871](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2871)) ([d33c6f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d33c6f232a3c5673e618fa62692d2d3bbfe4c0fc))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.47.0 to ^0.48.0

## [0.10.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.9.2...instrumentation-kafkajs-v0.10.0) (2025-05-15)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2828](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2828)) ([59c2a4c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59c2a4c002992518da2d91b4ceb24f8479ad2346))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.46.0 to ^0.47.0

## [0.9.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.9.1...instrumentation-kafkajs-v0.9.2) (2025-05-02)


### Bug Fixes

* **instrumentation-kafkajs:** add missing delcare keyword for metric instruments ([#2805](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2805)) ([32f41ee](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/32f41ee3feab7b58b48330469037fa4ca308055c))

## [0.9.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.9.0...instrumentation-kafkajs-v0.9.1) (2025-04-16)


### Bug Fixes

* **instrumentation-kafkajs:** fix instr to work with kafkajs@1.7.0 and earlier ([#2787](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2787)) ([e88ca9d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e88ca9d614159e682997bef671e12d20ca5f8c34)), closes [#2784](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2784)

## [0.9.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.8.0...instrumentation-kafkajs-v0.9.0) (2025-04-08)


### ⚠ BREAKING CHANGES

* **instrumentation-kafkajs:** add .tav.yml and narrow support range to (>=0.3.0 <3) ([#2758](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2758))

### Features

* **instrumentation-kafkajs:** add .tav.yml and narrow support range to (&gt;=0.3.0 &lt;3) ([#2758](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2758)) ([5837997](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5837997dfb42a6ea6482999c0ca3e00cf68cdb8d))
* **instrumentation-kafkajs:** update semantic conventions ([#2752](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2752)) ([407f615](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/407f61591ba69a39a6908264379d4d98a48dbec4))

## [0.8.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.7.1...instrumentation-kafkajs-v0.8.0) (2025-03-18)


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

## [0.7.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.7.0...instrumentation-kafkajs-v0.7.1) (2025-02-19)


### Bug Fixes

* **deps:** update otel core experimental to ^0.57.1 ([#2687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2687)) ([5e20fe2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5e20fe2f450a1be4ea100e8a6d196e33ccff0cda))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.45.0 to ^0.45.1

## [0.7.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.6.0...instrumentation-kafkajs-v0.7.0) (2024-12-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2608](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2608)) ([aa46705](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa46705d2fd1bd5ee6d763ac8cd73a7630889d34))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.44.0 to ^0.45.0

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.5.0...instrumentation-kafkajs-v0.6.0) (2024-12-04)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2582)) ([5df02cb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5df02cbb35681d2b5cce359dda7b023d7bf339f2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.43.0 to ^0.44.0

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.4.0...instrumentation-kafkajs-v0.5.0) (2024-11-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2535](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2535)) ([5223a6c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5223a6ca10c5930cf2753271e1e670ae682d6d9c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.42.0 to ^0.43.0

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.3.0...instrumentation-kafkajs-v0.4.0) (2024-10-25)


### Features

* update "@opentelemetry/*" dependencies to 1.27.0/0.54.0 ([2822511](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2822511a8acffb875ebd67ff2cf95980a9ddc01e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.41.0 to ^0.42.0

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.2.0...instrumentation-kafkajs-v0.3.0) (2024-09-02)


### Features

* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.40.0 to ^0.41.0

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.1.0...instrumentation-kafkajs-v0.2.0) (2024-07-03)


### ⚠ BREAKING CHANGES

* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196))

### Bug Fixes

* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196)) ([01c28ae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/01c28ae016ed32f9968e52bc91e3e3700dcef82e))

## [0.1.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.0.1...instrumentation-kafkajs-v0.1.0) (2024-06-06)


### Features

* kafkajs instrumentation ([#2089](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2089)) ([b41797b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b41797b2b8a11a7db4d3ec13c2452d824f45f82d))
* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.39.0 to ^0.40.0
