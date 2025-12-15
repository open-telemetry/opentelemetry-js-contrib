<!-- markdownlint-disable MD007 MD034 -->
# Changelog

## [0.1.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.0.0...instrumentation-browser-navigation-v0.1.0) (2025-12-03)

### Features

* **instrumentation-browser-navigation:** add new browser navigation instrumentation package
  * Tracks browser navigation events including page loads and same-document navigations
  * Supports both Navigation API and traditional browser APIs (pushState, replaceState, popstate, hashchange)
  * Configurable URL sanitization with default credential and sensitive parameter removal
  * Comprehensive semantic conventions for navigation attributes (url.full, browser.navigation.same_document, browser.navigation.hash_change, browser.navigation.type)
  * Feature detection for Navigation API with graceful fallback to traditional APIs
