# Changelog

## [0.32.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.32.3...instrumentation-long-task-v0.32.4) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.32.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.32.2...instrumentation-long-task-v0.32.3) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.32.1...instrumentation-long-task-v0.32.2) (2023-03-03)


### Bug Fixes

* remove component attribute from instrumentations ([#1399](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1399)) ([e93a192](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e93a192b672c8db361bac83ad60294ca49b95361))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.32.0...instrumentation-long-task-v0.32.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.31.1...instrumentation-long-task-v0.32.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.31.0...instrumentation-long-task-v0.31.1) (2022-11-02)


### Bug Fixes

* address webpack memory issue for browser tests ([#1264](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1264)) ([c7f08fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c7f08fed51bca68b0c522769c3c589102b98ec93))
* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.30.0...instrumentation-long-task-v0.31.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.29.0...instrumentation-long-task-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.28.0...instrumentation-long-task-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* update webpack outside of examples ([#963](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/963)) ([9a58648](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9a586480ed6a7677fb1283a61d05540345c52617))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.27.0...instrumentation-long-task-v0.28.0) (2022-03-02)


### Features

* Long Tasks instrumentation ([#757](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/757)) ([56d332e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/56d332e58ab2ed35fc11c4b30c8a812dd41670d3))
* **longtasks:** allow callback to add span attributes on collection ([#863](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/863)) ([1f68004](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1f68004ef9b25b0d260159f4b1e2f279b1a64649))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
