<!-- markdownlint-disable MD007 MD034 -->
# Changelog

## [0.31.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.31.1...resource-detector-github-v0.31.2) (2025-09-29)


### Bug Fixes

* force new release-please PR ([#3123](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3123)) ([0dab838](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0dab8383b5349e21a968fe2cedd8a6e2243f86d0))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.31.0...resource-detector-github-v0.31.1) (2025-09-25)


### Bug Fixes

* force new release-please PR ([#3098](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3098)) ([13c58e9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/13c58e9ad77b266a03e34ffd4b61ab18c86f9d73))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.30.0...resource-detector-github-v0.31.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.29.0...resource-detector-github-v0.30.0) (2025-01-20)


### Features

* **detectors:** generate esm build files too ([#2636](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2636)) ([c2ad0af](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c2ad0af34e1570f3609beefc4a8d41ddfb7f8f77))
* **detectors:** mark as side effect free ([#2663](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2663)) ([e9263a3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9263a36255c0016cca78bf16c4598f23519d5f1))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.28.2...resource-detector-github-v0.29.0) (2024-08-05)


### ⚠ BREAKING CHANGES

* **detector-github:** change implementation to DetectorSync interface ([#2336](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2336))

### Features

* **detector-github:** change implementation to DetectorSync interface ([#2336](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2336)) ([d52d421](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d52d4218235528dcecc706867425b86bac49b1f0))

## [0.28.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.28.1...resource-detector-github-v0.28.2) (2024-04-25)


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.28.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.28.0...resource-detector-github-v0.28.1) (2023-08-14)


### Bug Fixes

* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.27.1...resource-detector-github-v0.28.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))

## [0.27.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.27.0...resource-detector-github-v0.27.1) (2023-05-16)


### Bug Fixes

* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.27.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.26.1...resource-detector-github-v0.27.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

### [0.26.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.26.0...resource-detector-github-v0.26.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.25.0...resource-detector-github-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))
