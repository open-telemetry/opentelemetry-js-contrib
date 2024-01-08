# Changelog

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.34.0...host-metrics-v0.34.1) (2024-01-04)


### Bug Fixes

* **host-metrics:** bump minimum systeminformation version to 5.21.20 (security) ([#1868](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1868)) ([c59e666](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c59e666de2b1361ae80697d546633a7d3643ba00))

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.33.2...host-metrics-v0.34.0) (2023-12-07)


### ⚠ BREAKING CHANGES

* **host-metrics:** use the package name as the default instrumentation scope name, to align with instrumentations ([#1822](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1822))

### Features

* **host-metrics:** use the package name as the default instrumentation scope name, to align with instrumentations ([#1822](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1822)) ([bcf3501](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bcf3501e623d0fa6af87eeeef0f1cdd2ef755857)), closes [#1782](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1782)

## [0.33.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.33.1...host-metrics-v0.33.2) (2023-11-13)


### Bug Fixes

* host-metrics `system.cpu.utilization` calculation fix ([#1741](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1741)) ([b9350d9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b9350d918bf08569cffb3374d2b1e1fff6b38b80))

## [0.33.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.33.0...host-metrics-v0.33.1) (2023-08-14)


### Bug Fixes

* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.32.2...host-metrics-v0.33.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.32.1...host-metrics-v0.32.2) (2023-05-16)


### Bug Fixes

* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.32.0...host-metrics-v0.32.1) (2023-04-25)


### Bug Fixes

* **host-metrics:** fallback to process.memoryUsage() ([#1471](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1471)) ([4d11d61](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4d11d61b709cf12d7d02d31960cd7ccb67404b14))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.31.0...host-metrics-v0.32.0) (2023-04-06)


### Features

* **host-metrics:** Add process metrics ([#1449](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1449)) ([9268716](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/92687167f08ea7e3dec046ca7f2be86b337dd743))
* **host-metrics:** update host metrics to collect metrics in batch ([#1450](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1450)) ([6c708d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6c708d116264e395cf5eab94f3ba3250a8585c87))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.30.1...host-metrics-v0.31.0) (2022-11-16)


### Features

* use GA version of metrics ([#1281](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1281)) ([7f02de2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f02de23c3cedd6198bfd838e6b63002c3341bd8))

## [0.30.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.30.0...host-metrics-v0.30.1) (2022-09-27)


### Bug Fixes

* readme snippet ([#1182](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1182)) ([35d1e45](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/35d1e4579f7b160c501959f6fb45859b75cdde99))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.29.0...host-metrics-v0.30.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.28.0...host-metrics-v0.29.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.27.1...host-metrics-v0.28.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* **host-metrics:** upgrade api-metrics to v0.28.0 ([#990](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/990)) ([669d34b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/669d34b47e1eabbc99d9584d0d462333d37f4775))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

### [0.27.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.27.0...host-metrics-v0.27.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.26.0...host-metrics-v0.27.0) (2021-12-22)


### Features

* update host-metrics to api-metrics v0.27.0 ([#779](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/779)) ([9cef8a7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/9cef8a7e3a8cb358fd0095b64cbef3874ffee517))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.25.0...host-metrics-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))
