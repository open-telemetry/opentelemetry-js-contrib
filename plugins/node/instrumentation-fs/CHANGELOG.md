# Changelog

## [0.7.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.7.2...instrumentation-fs-v0.7.3) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.7.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.7.1...instrumentation-fs-v0.7.2) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.7.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.7.0...instrumentation-fs-v0.7.1) (2023-03-03)


### Bug Fixes

* **instrumentation-fs:** allow realpath.native and realpathSync.native ([#1332](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1332)) ([ee0a59a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ee0a59a59e94743b9411e10c09720a82c6586eb4))
* **instrumentation-fs:** fix instrumentation of `fs/promises` ([#1375](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1375)) ([3ca874e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3ca874e45ebf4623e76cbe9305e55e820b6e03fd))

## [0.7.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.6.0...instrumentation-fs-v0.7.0) (2023-02-07)


### Features

* **instrumentation-fs:** require parent span ([#1335](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1335)) ([79b2d3f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/79b2d3ff08904ce84c6bc48427cd98906c2f0d79))


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.5.1...instrumentation-fs-v0.6.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.5.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.5.0...instrumentation-fs-v0.5.1) (2022-11-02)


### Bug Fixes

* **instrumentation-fs:** fix `fs.exists` when it's util.promisified ([#1222](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1222)) ([180b336](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/180b336ab482f7656e51e5949b26f36d9ce70ed5))
* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.4.0...instrumentation-fs-v0.5.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.3.0...instrumentation-fs-v0.4.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.2.0...instrumentation-fs-v0.3.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.1.0...instrumentation-fs-v0.2.0) (2022-03-14)


### Features

* implement auto-instrumentation for `fs` ([#872](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/872)) ([c3fa161](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c3fa16170f96d18d071a84d75c920a4726ab2825))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
