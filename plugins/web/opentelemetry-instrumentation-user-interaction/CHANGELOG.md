# Changelog

## [0.30.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.30.0...instrumentation-user-interaction-v0.30.1) (2022-08-09)


### Bug Fixes

* **instrumentation-user-interaction:** addEventListener throws when calling with useCapture = null ([#1045](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1045)) ([893a9fc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/893a9fc2410d45eed68db06c9d3705f43edb75dd))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.29.0...instrumentation-user-interaction-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.28.1...instrumentation-user-interaction-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* update webpack outside of examples ([#963](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/963)) ([9a58648](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9a586480ed6a7677fb1283a61d05540345c52617))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))

### [0.28.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.28.0...instrumentation-user-interaction-v0.28.1) (2022-01-24)


### Bug Fixes

* fix CI by forcing colors@1.4.0 ([#825](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/825)) ([0ec9f08](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/0ec9f080520fe0f146a915a656300ef53a151ace))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.27.0...instrumentation-user-interaction-v0.28.0) (2021-12-22)


### Features

* **user-interaction:** support for custom events and span enhancement ([#653](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/653)) ([27e37e3](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/27e37e38f983eabdae4f2cfe859d156440378e08))


### Bug Fixes

* **user-interaction:** handle null listener in addEventListener ([#765](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/765)) ([aacfe82](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/aacfe82c85a9aebb1fdf3e38521144be09625dc8))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.26.0...instrumentation-user-interaction-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.25.0...instrumentation-user-interaction-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))


### Bug Fixes

* **user-interaction:** EventTarget is undefined in IE ([#627](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/627)) ([5a00bed](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/5a00bedece35b0e9f934a0f7c171796f6ce725ad))
