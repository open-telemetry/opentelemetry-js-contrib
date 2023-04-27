# Changelog

## [0.32.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.32.2...instrumentation-amqplib-v0.32.3) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.1 to ^0.33.2

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.32.1...instrumentation-amqplib-v0.32.2) (2023-02-14)


### Bug Fixes

* **amqplib:** stop importing from `amqplib` directly in compiled types ([#1394](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1394)) ([9d0198c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9d0198ca104a34726a7b41dd910df275e0c5336d))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.32.0...instrumentation-amqplib-v0.32.1) (2023-02-07)


### Bug Fixes

* **amqplib:** use extracted context for message consuming ([#1354](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1354)) ([ad92673](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ad92673bd6dbf154b8c73968f34d1e836099dd35))
* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))
* **instrumentation-amqplib:** move `@types/amqplib` into dev deps ([#1320](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1320)) ([52136d8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/52136d85064b0d451b3cc67530ee96f8bb8128af))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.0 to ^0.33.1

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.31.0...instrumentation-amqplib-v0.32.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.32.0 to ^0.33.0

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.30.0...instrumentation-amqplib-v0.31.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.29.0...instrumentation-amqplib-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.28.0...instrumentation-amqplib-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* enable a way to disable amqp tests that require a server running ([#1002](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1002)) ([1c916e4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1c916e488f5ccd9decaf3d022640d22ca9ae5fea))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* **amqplib:** add missing rabbit service to CI daily run ([#946](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/946)) ([5f63606](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f63606ee983b598d2ad8260e2fb2399cda29a7b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.28.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.27.0...instrumentation-amqplib-v0.28.0) (2022-03-14)


### Features

* amqplib instrumentation ([#892](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/892)) ([f6c16b6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f6c16b6e03f0984af79131e2607b6095350d796c))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
