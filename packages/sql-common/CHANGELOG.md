# Changelog

## [0.41.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/sql-common-v0.40.1...sql-common-v0.41.0) (2025-03-18)


### ⚠ BREAKING CHANGES

* chore!: Update to 2.x and 0.200.x @opentelemetry/* packages from opentelemetry-js.git per [2.x upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
  * The minimum supported Node.js has been raised to ^18.19.0 || >=20.6.0. This means that support for Node.js 14 and 16 has been dropped.
  * The minimum supported TypeScript version has been raised to 5.0.4.
  * The compilation target for transpiled TypeScript has been raised to ES2022 (from ES2017).

### Miscellaneous Chores

* update to JS SDK 2.x ([#2738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2738)) ([7fb4ba3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7fb4ba3bc36dc616bd86375cfd225722b850d0d5))

## [0.40.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/sql-common-v0.40.0...sql-common-v0.40.1) (2024-04-25)


### Bug Fixes

* revert modifications to Apache license ([#2105](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2105)) ([4590c8d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4590c8df184bbcb9bd67ce1111df9f25f865ccf2))

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/sql-common-v0.39.0...sql-common-v0.40.0) (2023-07-12)


### Features

* add sqlcommenter comment to mysql2 queries ([#1523](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1523)) ([856c252](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/856c25211567104ced8b2a2b56d0818a3c48e671))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
