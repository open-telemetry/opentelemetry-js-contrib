# Changelog

## [2.0.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-aws-xray-v1.26.2...propagator-aws-xray-v2.0.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [1.26.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-aws-xray-v1.26.1...propagator-aws-xray-v1.26.2) (2025-02-19)


### Bug Fixes

* **deps:** update all patch versions ([#2413](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2413)) ([1a55420](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1a55420d8c00ca998b57270df77857c48ebbe8d7))

## [1.26.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-aws-xray-v1.26.0...propagator-aws-xray-v1.26.1) (2025-01-09)


### Bug Fixes

* **propagator-aws-xray:** correctly propagate over grpc ([#2604](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2604)) ([4cfcc59](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4cfcc59441da12c7c20132484e8fbe8282af33d2))
