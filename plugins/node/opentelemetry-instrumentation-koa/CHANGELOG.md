# Changelog

## [0.34.5](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.34.4...instrumentation-koa-v0.34.5) (2023-05-16)


### Bug Fixes

* **deps:** update dependency @koa/router to v12 ([#1483](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1483)) ([b5b951e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b5b951e5d943d9ef9df7ae3acefe8ea40b8e514f))
* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.34.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.34.3...instrumentation-koa-v0.34.4) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.34.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.34.2...instrumentation-koa-v0.34.3) (2023-04-06)


### Bug Fixes

* **@types/koa:** update @types/koa version to latest ([#1447](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1447)) ([5f180aa](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f180aa05d3140010642287de933c708e915b619))

## [0.34.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.34.1...instrumentation-koa-v0.34.2) (2023-03-03)


### Bug Fixes

* remove component attribute from instrumentations ([#1399](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1399)) ([e93a192](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e93a192b672c8db361bac83ad60294ca49b95361))

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.34.0...instrumentation-koa-v0.34.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.33.0...instrumentation-koa-v0.34.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.32.0...instrumentation-koa-v0.33.0) (2022-11-02)


### Features

* **koa:** add layer type to request hook context ([#1226](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1226)) ([6300733](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6300733ddfa7357546500782d83d63320c134013))


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.31.0...instrumentation-koa-v0.32.0) (2022-09-02)


### Features

* **koa:** add requestHook support ([#1099](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1099)) ([99279d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/99279d5085e94c0f6b99d4ffe2858d6d0ff96019))
* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Bug Fixes

* **koa:** ignore generator-based Koa middleware ([#1119](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1119)) ([6684b56](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6684b56b8043f094b95fc3c1ce5e5599e694bad4))
* mongodb types fails to compile with latest tsc v4.8 ([#1141](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1141)) ([ec9ee13](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ec9ee131635dc2db88deea4f2efb887ff6f60577))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.30.0...instrumentation-koa-v0.31.0) (2022-08-09)


### Features

* use Koa router name as span name if available ([#976](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/976)) ([fa4fe9c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fa4fe9c9137e198aef897a2c4e01c932c62faabf))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.29.0...instrumentation-koa-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.28.1...instrumentation-koa-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

### [0.28.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.28.0...instrumentation-koa-v0.28.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.27.0...instrumentation-koa-v0.28.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.26.0...instrumentation-koa-v0.27.0) (2021-11-19)


### Features

* **koa:** add a config option to allow layers to be ignored by type ([#646](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/646)) ([572ed66](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/572ed665ea4ac93082c347f7179d67e9a8fe19b8))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.25.0...instrumentation-koa-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))
