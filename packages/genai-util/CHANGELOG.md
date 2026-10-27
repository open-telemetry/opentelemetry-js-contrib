# Changelog

## Unreleased

### Features

* **genai-util:** export TelemetryHandler, invocation types, content-capture helpers, `getErrorType`, and GenAI semconv constants for instrumentation consumers ([#3668](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3668))

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/genai-util-v0.3.0...genai-util-v0.4.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* bump versions to SDK 3.0/API 1.10.0 ([#3839](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3839))
* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3847](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3847))

### Miscellaneous Chores

* bump versions to SDK 3.0/API 1.10.0 ([#3839](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3839)) ([cfdbfcc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cfdbfcc67f724eee24feedd8d930104cc587deb3))
* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3847](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3847)) ([79dc211](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/79dc2114b5a819d8b541c0744e5f49abde8f9b8c))

## [0.3.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/genai-util-v0.2.0...genai-util-v0.3.0) (2026-10-15)


### Features

* **genai-util:** add support for core invocations ([#3762](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3762)) ([fe18c40](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fe18c40b42aaed5707acaa2eb4af75a3e5d2a4bb))

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/genai-util-v0.1.0...genai-util-v0.2.0) (2026-10-06)


### Features

* **genai-util:** accept structured InvocationError in fail() ([#3772](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3772)) ([d666b7d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d666b7de6bb6e0b366087c97990d498bf4738457))
* **genai-util:** add base invocation lifecycle and TelemetryHandler ([#3757](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3757)) ([999f622](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/999f622818d1ea78b53bc8096768796155ea1110))
* **genai-util:** add GenAI metric helpers and histograms ([#3712](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3712)) ([ef0c42d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ef0c42d5e59ace067d9548c398c4010c3285e8e3))
* **genai-util:** scaffold package, types, semconv and core utils ([#3709](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3709)) ([bf0af15](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bf0af15ea83614aaf46697f918b62c37ed5d2390))
