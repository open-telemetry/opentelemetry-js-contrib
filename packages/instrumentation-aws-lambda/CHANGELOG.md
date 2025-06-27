# Changelog

## [0.53.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.52.0...instrumentation-aws-lambda-v0.53.0) (2025-06-02)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2871](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2871)) ([d33c6f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d33c6f232a3c5673e618fa62692d2d3bbfe4c0fc))

## [0.52.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.51.1...instrumentation-aws-lambda-v0.52.0) (2025-05-15)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2828](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2828)) ([59c2a4c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59c2a4c002992518da2d91b4ceb24f8479ad2346))

## [0.51.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.51.0...instrumentation-aws-lambda-v0.51.1) (2025-05-02)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/propagator-aws-xray bumped from ^2.0.0 to ^2.1.0
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.54.0 to ^0.55.0

## [0.51.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.50.3...instrumentation-aws-lambda-v0.51.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Bug Fixes

* **deps:** update otel core experimental to ^0.57.2 ([#2716](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2716)) ([d2a9a20](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d2a9a20f1cd8c46c842e18490a4eba36fd71c2da))
* **instrumentation-aws-lambda:** Change endSpan error-logs for forceflush into debug-logs ([#2753](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2753)) ([4b51e60](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4b51e606d47af1904b5de0ab649296bfdd115c9d))


### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.26.2 to ^2.0.0
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.53.2 to ^0.54.0

## [0.50.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.50.2...instrumentation-aws-lambda-v0.50.3) (2025-02-19)


### Bug Fixes

* **deps:** update all patch versions ([#2413](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2413)) ([1a55420](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1a55420d8c00ca998b57270df77857c48ebbe8d7))
* **deps:** update otel core experimental to ^0.57.1 ([#2687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2687)) ([5e20fe2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5e20fe2f450a1be4ea100e8a6d196e33ccff0cda))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.26.1 to ^1.26.2
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.53.1 to ^0.53.2

## [0.50.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.50.1...instrumentation-aws-lambda-v0.50.2) (2025-01-20)


### Bug Fixes

* **instrumentation-aws-lambda:** do not import from semantic-conventions incubating entry-point ([#2670](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2670)) ([0db649f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0db649f8c59b6b4df455dd0012d735ce9b0118af))

## [0.50.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.50.0...instrumentation-aws-lambda-v0.50.1) (2025-01-09)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.25.1 to ^1.26.1
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.53.0 to ^0.53.1

## [0.50.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.49.0...instrumentation-aws-lambda-v0.50.0) (2024-12-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2608](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2608)) ([aa46705](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa46705d2fd1bd5ee6d763ac8cd73a7630889d34))
* report url for lambda invoked via api gateway ([#2404](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2404)) ([91c9089](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/91c90892b8f9f4f37968e1f176c23696d7196da3))

## [0.49.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.48.0...instrumentation-aws-lambda-v0.49.0) (2024-12-04)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2582)) ([5df02cb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5df02cbb35681d2b5cce359dda7b023d7bf339f2))

## [0.48.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.47.0...instrumentation-aws-lambda-v0.48.0) (2024-11-18)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#2535](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2535)) ([5223a6c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5223a6ca10c5930cf2753271e1e670ae682d6d9c))

## [0.47.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.46.0...instrumentation-aws-lambda-v0.47.0) (2024-11-07)


### ⚠ BREAKING CHANGES

* **aws-lambda:** Remove explicit x-ray context in favor of global propagator ([#2369](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2369))

### Features

* **aws-lambda:** Remove explicit x-ray context in favor of global propagator ([#2369](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2369)) ([a926f53](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a926f536733a2add23464bd26988cf253bdda305))
* **instrumentation-aws-lambda:** take care of ESM based (`.mjs`) handlers ([#2508](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2508)) ([0309cae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0309caeafc44ac9cb13a3345b790b01b76d0497d))

## [0.46.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.45.0...instrumentation-aws-lambda-v0.46.0) (2024-10-25)


### Features

* update "@opentelemetry/*" dependencies to 1.27.0/0.54.0 ([2822511](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2822511a8acffb875ebd67ff2cf95980a9ddc01e))

## [0.45.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.44.0...instrumentation-aws-lambda-v0.45.0) (2024-10-08)


### Features

* Record AWS Lambda coldstarts ([#2403](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2403)) ([bc69fff](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bc69fffc106142ed4c8333d3f6122329f51e4039))

## [0.44.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.43.0...instrumentation-aws-lambda-v0.44.0) (2024-09-02)


### Features

* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))

## [0.43.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.42.0...instrumentation-aws-lambda-v0.43.0) (2024-07-03)


### ⚠ BREAKING CHANGES

* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196))

### Bug Fixes

* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196)) ([01c28ae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/01c28ae016ed32f9968e52bc91e3e3700dcef82e))

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.41.1...instrumentation-aws-lambda-v0.42.0) (2024-06-06)


### Features

* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))

## [0.41.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.41.0...instrumentation-aws-lambda-v0.41.1) (2024-05-15)


### Bug Fixes

* **aws-lambda:** update semconv package and readme ([#2181](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2181)) ([b432929](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b432929f4b5682e7879c50682547cea25790c588))

## [0.41.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.40.0...instrumentation-aws-lambda-v0.41.0) (2024-04-25)


### Features

* **deps:** update otel-js to 0.51.0 ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
* remove generic type from instrumentations ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.39.0...instrumentation-aws-lambda-v0.40.0) (2024-04-03)


### Features

* **deps:** update otel-js to 1.23.0/0.50.0 ([#2076](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2076)) ([d5f079b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d5f079b3992395dcfb3b791c9fdaeefd6d6526f8))

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.38.0...instrumentation-aws-lambda-v0.39.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.37.4...instrumentation-aws-lambda-v0.38.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))

## [0.37.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.37.3...instrumentation-aws-lambda-v0.37.4) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))

## [0.37.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.37.2...instrumentation-aws-lambda-v0.37.3) (2023-12-07)


### Bug Fixes

* **instrumentation-lambda:** soften "unable to init" message and demote to diag.debug ([#1836](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1836)) ([fb80783](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fb807835e9317891e6f18715e708e9993b8797d8))

## [0.37.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.37.1...instrumentation-aws-lambda-v0.37.2) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))

## [0.37.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.37.0...instrumentation-aws-lambda-v0.37.1) (2023-10-10)


### Bug Fixes

* **deps:** update all patch versions ([#1687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1687)) ([47301c0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47301c038e4dc7d24797cb0b8426033ecc0374e6))
* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))

## [0.37.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.36.0...instrumentation-aws-lambda-v0.37.0) (2023-08-14)


### Features

* **instrumentation-aws-lambda:** Adds lambdaHandler config option ([#1627](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1627)) ([c4a8e82](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c4a8e8238d5876c030676fd53cb8718f95653993))


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.3.0 to ^1.3.1

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.35.3...instrumentation-aws-lambda-v0.36.0) (2023-07-12)


### Features

* **lambda:** add OTEL_LAMBDA_DISABLE_AWS_CONTEXT_PROPAGATION environment variable ([#1227](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1227)) ([8777cbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8777cbd3178bb970686488c7e8383d5fa0aaa187))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.2.1 to ^1.3.0

## [0.35.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.35.2...instrumentation-aws-lambda-v0.35.3) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))

## [0.35.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.35.1...instrumentation-aws-lambda-v0.35.2) (2023-05-16)


### Bug Fixes

* .cjs extension support for lambda functions ([#1442](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1442)) ([da737f1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/da737f1c1eda59d7e340c4026a212d21abcb72d6))
* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))
* **eslint-eqeqeq:** updated the `eqeqeq` rule to match the core repo ([#1485](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1485)) ([5709008](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5709008dfa4d05cae0c2226b9926e36cdf60c631))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.2.0 to ^1.2.1

## [0.35.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.35.0...instrumentation-aws-lambda-v0.35.1) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.34.1...instrumentation-aws-lambda-v0.35.0) (2023-02-08)


### Features

* **instrumentation-lambda:** Flush MeterProvider at end of handler ([#1370](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1370)) ([096129c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/096129c9c1b68c7f6cccbfab42f8d2167bc40927))


### Bug Fixes

* **instrumentation/aws-lambda:** Ensure callback is only called once ([#1384](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1384)) ([d822f75](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d822f75e10d6d0421fe8fbd4b1dca261de736e69))

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.34.0...instrumentation-aws-lambda-v0.34.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.1.1 to ^1.2.0

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.33.1...instrumentation-aws-lambda-v0.34.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.33.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.33.0...instrumentation-aws-lambda-v0.33.1) (2022-11-02)


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.1.0 to ^1.1.1

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.32.0...instrumentation-aws-lambda-v0.33.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.31.0...instrumentation-aws-lambda-v0.32.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.30.0...instrumentation-aws-lambda-v0.31.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from 1.0.1 to ^1.1.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.29.0...instrumentation-aws-lambda-v0.30.0) (2022-03-14)


### Features

* support baggage propagation in aws lambda custom context extraction ([#843](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/843)) ([da792fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/da792fe3c629354cf9e8faeca48c17e73dffc6be))

## [0.29.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.28.1...instrumentation-aws-lambda-v0.29.0) (2022-02-06)


### Features

* support using lambda context in the aws lambda context extractor ([#860](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/860)) ([5cb3266](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/5cb3266773f3f66d02af3306ae7332288bcae6af))

### [0.28.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.28.0...instrumentation-aws-lambda-v0.28.1) (2022-01-24)


### Bug Fixes

* fix CI by forcing colors@1.4.0 ([#825](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/825)) ([0ec9f08](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/0ec9f080520fe0f146a915a656300ef53a151ace))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^1.0.0 to ^1.0.1

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.27.0...instrumentation-aws-lambda-v0.28.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.26.0...instrumentation-aws-lambda-v0.27.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))


### Bug Fixes

* prevent invalid context propagation in lambda functions ([#677](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/677)) ([25c0e30](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/25c0e30d34faf3f27edcfb330874f54e4db03f59))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^0.24.0 to ^1.0.0

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.25.0...instrumentation-aws-lambda-v0.26.0) (2021-09-22)


### Features

* upstream mocha instrumentation testing plugin from ext-js [#621](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))


### Bug Fixes

* **aws-lambda:** BasicTracerProvider not force flushing ([#661](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/661)) ([76e0d0f](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/76e0d0fbef59e84c42b52d37cb3541e0dc853eb6))
* Update aws-lambda-instrumentation to SDK v0.25.0 ([#660](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/660)) ([7b0d090](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7b0d0900bfb8475a32d799add4d925d7addbb24d))
