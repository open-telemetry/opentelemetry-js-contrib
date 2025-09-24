<!-- markdownlint-disable MD007 MD034 -->
# Changelog

## [0.28.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.28.0...propagator-ot-trace-v0.28.1) (2025-09-01)


### Bug Fixes

* **deps:** update all patch versions ([#2948](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2948)) ([5836d7a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5836d7ab3244adef62b715ef22a26b54dba6719b))

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.27.3...propagator-ot-trace-v0.28.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [0.27.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.27.2...propagator-ot-trace-v0.27.3) (2025-02-19)


### Bug Fixes

* **deps:** update all patch versions ([#2413](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2413)) ([1a55420](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1a55420d8c00ca998b57270df77857c48ebbe8d7))

## [0.27.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.27.1...propagator-ot-trace-v0.27.2) (2024-04-25)


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.27.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.27.0...propagator-ot-trace-v0.27.1) (2023-08-14)


### Bug Fixes

* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.27.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.26.3...propagator-ot-trace-v0.27.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))

## [0.26.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.26.2...propagator-ot-trace-v0.26.3) (2023-05-16)


### Bug Fixes

* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))
* **eslint-eqeqeq:** updated the `eqeqeq` rule to match the core repo ([#1485](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1485)) ([5709008](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5709008dfa4d05cae0c2226b9926e36cdf60c631))

## [0.26.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.26.1...propagator-ot-trace-v0.26.2) (2022-11-02)


### Bug Fixes

* address webpack memory issue for browser tests ([#1264](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1264)) ([c7f08fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c7f08fed51bca68b0c522769c3c589102b98ec93))

## [0.26.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.26.0...propagator-ot-trace-v0.26.1) (2022-08-09)


### Bug Fixes

* **propagator-ot-trace:** read sampled flag correctly from span context ([#1077](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1077)) ([69740ab](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/69740aba848486908e924376e3ca093ab88720b6))

## [0.26.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.25.1...propagator-ot-trace-v0.26.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* update webpack outside of examples ([#963](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/963)) ([9a58648](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9a586480ed6a7677fb1283a61d05540345c52617))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

### [0.25.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.25.0...propagator-ot-trace-v0.25.1) (2022-01-24)


### Bug Fixes

* fix CI by forcing colors@1.4.0 ([#825](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/825)) ([0ec9f08](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/0ec9f080520fe0f146a915a656300ef53a151ace))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
