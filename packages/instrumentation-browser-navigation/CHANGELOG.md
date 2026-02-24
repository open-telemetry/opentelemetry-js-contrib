<!-- markdownlint-disable MD007 MD034 -->
# Changelog

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.4.0...instrumentation-browser-navigation-v0.5.0) (2026-02-16)


### Features

* **deps:** update deps matching "@opentelemetry/*" ([#3383](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3383)) ([d3ac785](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3ac7851d69d0781c2c631012937a73998b744e1))

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.3.0...instrumentation-browser-navigation-v0.4.0) (2026-01-21)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#3353](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3353)) ([a56bbdc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a56bbdc34a5015b0a5fdcb7522f168cfc90ba95c))

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.2.0...instrumentation-browser-navigation-v0.3.0) (2026-01-14)


### Features

* **deps:** update deps matching '@opentelemetry/*' ([#3332](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3332)) ([925a150](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/925a1501ce0d082c6845d36e7c964e625ee3de0c))
* **deps:** update deps matching '@opentelemetry/*' ([#3340](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3340)) ([2954943](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/29549434e7204b03d58635eb20352efee0e797d4))


### Bug Fixes

* **instrumentation-browser-navigation:** improve test stability with … ([#3323](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3323)) ([b59b196](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b59b196eefb4888d0cba1f19be651eb3f01e530a))
* **instrumentation-browser-navigation:** use 'declare' to avoid JS class field initialization surprise ([#3326](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3326)) ([451caaf](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/451caaf158d9bf9fa50cccec9bd48b9b58e59efa))

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.1.0...instrumentation-browser-navigation-v0.2.0) (2025-12-17)


### Features

* Browser Navigation Instrumentation ([#3148](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3148)) ([9c1503f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9c1503f61cc165b9b67408ac307774868eef5b46))

## [0.1.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.0.0...instrumentation-browser-navigation-v0.1.0) (2025-12-03)

### Features

* **instrumentation-browser-navigation:** add new browser navigation instrumentation package
  * Tracks browser navigation events including page loads and same-document navigations
  * Supports both Navigation API and traditional browser APIs (pushState, replaceState, popstate, hashchange)
  * Configurable URL sanitization with default credential and sensitive parameter removal
  * Comprehensive semantic conventions for navigation attributes (url.full, browser.navigation.same_document, browser.navigation.hash_change, browser.navigation.type)
  * Feature detection for Navigation API with graceful fallback to traditional APIs
