# Changelog

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.5.0...instrumentation-undici-v0.6.0) (2024-09-02)


### Features

* update deps matching "@opentelemetry/" ([9fa058e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fa058ebb919de4e2a4e1af95b3c792c6ea962ac))

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.4.0...instrumentation-undici-v0.5.0) (2024-08-27)


### Features

* **instrumentation-undici:** Add `responseHook` ([#2356](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2356)) ([60a99c9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/60a99c98fd3a5594c7c2234184f06166b375e707))


### Bug Fixes

* **instr-undici:** fix issue with config in constructor ([#2395](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2395)) ([ca70bb9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ca70bb9c8cc8128bd202a8a9a29bb5c788ea5332))

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.3.0...instrumentation-undici-v0.4.0) (2024-07-03)


### ⚠ BREAKING CHANGES

* export instrumentations only as named export ([#2296](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2296))
* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196))

### Bug Fixes

* export instrumentations only as named export ([#2296](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2296)) ([0ed4038](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0ed40384287a8d06549c2a9c98a26ea9b068c472))
* **instr-undici:** respect requireParent flag when INVALID_SPAN_CONTEXT is used ([#2273](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2273)) ([b08f01f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b08f01f2d4604c14334b860e411eb55c58631171))
* **instr-undici:** wrong user agent reported if no user agent were set ([#2282](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2282)) ([72e3f66](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/72e3f66c2049189172491a166a20c1af3f547ee5))
* standardize supported versions and set upper bound limit ([#2196](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2196)) ([01c28ae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/01c28ae016ed32f9968e52bc91e3e3700dcef82e))

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.2.0...instrumentation-undici-v0.3.0) (2024-06-06)


### Features

* update otel core dependencies ([#2257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2257)) ([71c15d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/71c15d597276773c19c16c1117b8d151892e5366))

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.1.0...instrumentation-undici-v0.2.0) (2024-04-25)


### Features

* **deps:** update otel-js to 0.51.0 ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
* **instr-undici:** add instrumentation for `undici` versions `&gt;=5 &lt;7` and global `fetch` API ([#1951](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1951)) ([fe18e2f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fe18e2fbb2a6535cb72f314fdb1550a3a4160403))
* remove generic type from instrumentations ([80cbee7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80cbee73130c65c8ccd78384485a7be8d2a4a84b))
