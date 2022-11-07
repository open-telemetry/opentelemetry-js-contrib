# Changelog

## [0.31.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.2...instrumentation-express-v0.31.3) (2022-11-02)


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.31.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.1...instrumentation-express-v0.31.2) (2022-09-28)


### Bug Fixes

* **express:** use the same clock for span start and end ([#1210](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1210)) ([cbeef6e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cbeef6eef7c4ec8801389fdf9787722b89056537))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.0...instrumentation-express-v0.31.1) (2022-09-15)


### Bug Fixes

* **readme:** Correct urls to npm ([#1144](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1144)) ([d8767a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d8767a9032dd7fb78b7fdd82f50c1f76e939d33e))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.30.0...instrumentation-express-v0.31.0) (2022-09-02)


### Features

* **express:** add requestHook support ([#1091](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1091)) ([bcc048b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bcc048b4de1293b0d932ac69dc0b0c056aca13ee))
* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Bug Fixes

* mongodb types fails to compile with latest tsc v4.8 ([#1141](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1141)) ([ec9ee13](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ec9ee131635dc2db88deea4f2efb887ff6f60577))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.29.0...instrumentation-express-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.28.0...instrumentation-express-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* correctly disable Express instrumentation ([#972](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/972)) ([b55b79b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b55b79b72451c65080e01c2ec11655cabd5f65d9))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.27.1...instrumentation-express-v0.28.0) (2022-02-06)


### Features

* **express:** allow rewriting span names ([#463](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/463)) ([7510757](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7510757aeeee47a7f0c4bb31de45be3a71bb673e))

### [0.27.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.27.0...instrumentation-express-v0.27.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.26.0...instrumentation-express-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.25.0...instrumentation-express-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))
