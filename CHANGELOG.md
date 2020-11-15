# CHANGELOG

All notable changes to this project will be documented in this file.

## Unreleased

## 0.11.0

#### :bug: Bug Fix

* [#221](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/221) fix: wrapper function for hapi route & plugins ([@jk1z](https://github.com/jk1z))
* [#225](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/225) pg spans disconnected from parent ([@obecny](https://github.com/obecny))
* [#208](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/208) [mysql] fix: ensure span name is a string to avoid [object Object] as span name ([@naseemkullah](https://github.com/naseemkullah))
* [#175](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/175) fix: accept EventListener callbacks ([@johnbley](https://github.com/johnbley))
* [#188](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/188) fix(express): listen for `finish` event on response for async express layer #107 ([@vmarchaud](https://github.com/vmarchaud))

#### :rocket: Enhancement

* Other
  * [#176](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/176) feat: reduce root span cardinality in express plugin ([@gecgooden](https://github.com/gecgooden))
  * [#226](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/226) feature: Graphql ([@obecny](https://github.com/obecny))
  * [#215](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/215) Allow redis version 3.0.0 and above ([@akshah123](https://github.com/akshah123))
  * [#212](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/212) docs: update dns status and add hapi koa ([@naseemkullah](https://github.com/naseemkullah))
* `opentelemetry-host-metrics`
  * [#227](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/227) Host Metrics ([@obecny](https://github.com/obecny))

#### Committers: 9

* Ankit Shah ([@akshah123](https://github.com/akshah123))
* Bartlomiej Obecny ([@obecny](https://github.com/obecny))
* Daniel Dyla ([@dyladan](https://github.com/dyladan))
* George Gooden ([@gecgooden](https://github.com/gecgooden))
* Jack Zhang ([@jk1z](https://github.com/jk1z))
* John Bley ([@johnbley](https://github.com/johnbley))
* Mark ([@MarkSeufert](https://github.com/MarkSeufert))
* Naseem ([@naseemkullah](https://github.com/naseemkullah))
* Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))

## 0.10.0

#### :bug: Bug Fix
* [#186](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/186) [size/XS] fix: fixes broken readme links ([@michaelgoin](https://github.com/michaelgoin))

#### :tada: New Plugins
* [#171](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/171) feat: Hapi auto-instrumentation ([@carolinee21](https://github.com/carolinee21))
* [#144](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/144) feat: adding Koa instrumentation ([@carolinee21](https://github.com/carolinee21))

#### :rocket: Enhancement
* Other
  * [#183](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/183) [mysql] implement semantic conventions ([@naseemkullah](https://github.com/naseemkullah))
  * [#196](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/196) fix: new version with TextMapPropagator interface ([@jufab](https://github.com/jufab))
  * [#184](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/184) chore: moved plugins-node-all into contrib repo from opentelemetry-js ([@michaelgoin](https://github.com/michaelgoin))
  * [#187](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/187) [mongodb] implement semantic db conventions ([@naseemkullah](https://github.com/naseemkullah))
  * [#172](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/172) [Plugin User Interaction]: Improve causality of spans from bubbled events ([@johnbley](https://github.com/johnbley))
  * [#164](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/164) feat: Add React Plugin ([@thgao](https://github.com/thgao))
  * [#170](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/170) fix: various compilation errors ([@naseemkullah](https://github.com/naseemkullah))
* `opentelemetry-test-utils`
  * [#167](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/167) ioredis and redis DB semantic conventions ([@naseemkullah](https://github.com/naseemkullah))

#### :house: Internal
* [#194](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/194) Ioredis cleanup ([@naseemkullah](https://github.com/naseemkullah))
* [#195](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/195) redis cleanup ([@naseemkullah](https://github.com/naseemkullah))
* [#192](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/192) Handful of document-load fixes ([@johnbley](https://github.com/johnbley))
* [#191](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/191) Zone.js fixed failing build ([@obecny](https://github.com/obecny))
* [#174](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/174) feat(opentelemetry-plugin-pg): omit pg.values by default ([@sergioregueira](https://github.com/sergioregueira))

#### Committers: 9
* Bartlomiej Obecny ([@obecny](https://github.com/obecny))
* John Bley ([@johnbley](https://github.com/johnbley))
* Julien Fabre ([@jufab](https://github.com/jufab))
* Michael Goin ([@michaelgoin](https://github.com/michaelgoin))
* Naseem ([@naseemkullah](https://github.com/naseemkullah))
* Sergio Regueira ([@sergioregueira](https://github.com/sergioregueira))
* Shivkanya Andhare ([@shivkanya9146](https://github.com/shivkanya9146))
* Tina Gao ([@thgao](https://github.com/thgao))
* [@carolinee21](https://github.com/carolinee21)

## 0.9.0

#### :rocket: (Enhancement)
* [#162](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/162) chore: clean up span naming ([@johnbley](https://github.com/johnbley))
* [#165](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/165) chore: bump opentelemetry core dependencies ([@dyladan](https://github.com/dyladan))

#### :bug: (Bug Fix)
* [#158](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/158) fix: patch removeEventListener to properly remove patched callbacks ([@johnbley](https://github.com/johnbley))

#### Committers: 10
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- John Bley ([@johnbley](https://github.com/johnbley))
- Mark Wolff ([@markwolff](https://github.com/markwolff))
- Mayur Kale ([@mayurkale22](https://github.com/mayurkale22))
- Naseem ([@naseemkullah](https://github.com/naseemkullah))
- Niall Kelly ([@nkelly75](https://github.com/nkelly75))
- Shivkanya Andhare ([@shivkanya9146](https://github.com/shivkanya9146))
- Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))
- [@rezakrimi](https://github.com/rezakrimi)

## 0.8.0 (`@opentelemetry/propagator-grpc-census-binary`)

#### :rocket: (Enhancement)
* [#39](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/39) feat: add gRPC Census propagator ([@nkelly75](https://github.com/nkelly75))

#### Committers: 1
- Niall Kelly ([@nkelly75](https://github.com/nkelly75))

## 0.8.0

Released 2020-05-29

#### :rocket: (Enhancement)
* [#30](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/30) Support OpenTelemetry SDK 0.8.x ([@dyladan](https://github.com/dyladan))
* `opentelemetry-plugin-mongodb`
  * [#34](https://github.com/open-telemetry/opentelemetry-js/pull/34) Enhanced Database Reporting for MongoDB ([@romil-punetha](https://github.com/romil-punetha))
* `opentelemetry-plugin-ioredis`
  * [#33](https://github.com/open-telemetry/opentelemetry-js/pull/33) feat(opentelemetry-plugin-ioredis): provide a custom serializer fn for db.statement ([@marcoreni](https://github.com/marcoreni))

#### Committers: 3
- Marco Reni ([@marcoreni](https://github.com/marcoreni))
- Romil Punetha ([@romil-punetha](https://github.com/romil-punetha))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))

## 0.7.0

Released 2020-04-27

#### :bug: (Bug Fix)
* `opentelemetry-plugin-express`
  * [#910](https://github.com/open-telemetry/opentelemetry-js/pull/910) fix(plugin-express): fix double span end #908 ([@vmarchaud](https://github.com/vmarchaud))
* `opentelemetry-plugin-mongodb`
  * [#5](https://github.com/open-telemetry/opentelemetry-js/pull/5) fix(mongodb): avoid double patching when enable is called twice ([@vmarchaud](https://github.com/vmarchaud))
* `opentelemetry-plugin-mongodb`
  * [#3](https://github.com/open-telemetry/opentelemetry-js/pull/3) Prevent double wrapping pg pool query ([@dyladan](https://github.com/dyladan))

#### :rocket: (Enhancement)
* `opentelemetry-plugin-express`
  * [#914](https://github.com/open-telemetry/opentelemetry-js/pull/914) feat: add express to default list of instrumented plugins ([@mayurkale22](https://github.com/mayurkale22))

#### Committers: 3
- Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))
- Mayur Kale ([@mayurkale22](https://github.com/mayurkale22))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))

## 0.6.1

Released 2020-04-08

For details about this release and all previous releases, see https://github.com/open-telemetry/opentelemetry-js/blob/master/CHANGELOG.md
