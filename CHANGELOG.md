# CHANGELOG

All notable changes to this project will be documented in this file.

## Unreleased

## 0.13.0

#### :bug: Bug Fix
* `opentelemetry-test-utils`
  * [#239](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/239) fix(plugin-ioredis): end span on response from the server and set span status according to response ([@blumamir](https://github.com/blumamir))
* Other
  * [#322](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/322) Fix link ([@jonaskello](https://github.com/jonaskello))
  * [#310](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/310) fix: move semantic-conventions to regular dependencies ([@dobesv](https://github.com/dobesv))
  * [#281](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/281) fix(koa): End span and record exception on a middleware exception ([@oguzbilgener](https://github.com/oguzbilgener))

#### :rocket: Enhancement
* Other
  * [#318](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/318) feat: OpenTracing propagator ([@mwear](https://github.com/mwear))
* `opentelemetry-host-metrics`, `opentelemetry-test-utils`
  * [#315](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/315) chore: update to OTel 0.15.0 ([@Flarna](https://github.com/Flarna))

#### :memo: Documentation
* `opentelemetry-host-metrics`
  * [#325](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/325) chore: change links to point to main ([@dyladan](https://github.com/dyladan))

#### Committers: 7
- Amir Blum ([@blumamir](https://github.com/blumamir))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Dobes Vandermeer ([@dobesv](https://github.com/dobesv))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Jonas Kello ([@jonaskello](https://github.com/jonaskello))
- Matthew Wear ([@mwear](https://github.com/mwear))
- Oğuz Bilgener ([@oguzbilgener](https://github.com/oguzbilgener))

## 0.12.1

#### :bug: Bug Fix

* [#299](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/299) chore: fixing parent span for graphql ([@obecny](https://github.com/obecny))
* [#300](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/300) chore: fixing async resolvers for graphql ([@obecny](https://github.com/obecny))
* [#290](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/290) docs: fix links to examples ([@aabmass](https://github.com/aabmass))

#### :rocket: Enhancement

* [#273](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/273) feat: enable root span route instrumentation without any express layer spans  ([@shyimo](https://github.com/shyimo))
* [#298](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/298) Add CodeQL Security Scans ([@amanbrar1999](https://github.com/amanbrar1999))

#### Committers: 7

* Aaron Abbott ([@aabmass](https://github.com/aabmass))
* Aman Brar ([@amanbrar1999](https://github.com/amanbrar1999))
* Bartlomiej Obecny ([@obecny](https://github.com/obecny))
* Dobes Vandermeer ([@dobesv](https://github.com/dobesv))
* Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
* Johannes Würbach ([@johanneswuerbach](https://github.com/johanneswuerbach))
* Shai Moria ([@shyimo](https://github.com/shyimo))

## 0.12.0

### :bug: Bug Fix

* [#241](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/241) fix(ioredis): set `net.peer.name` attribute according to spec ([@blumamir](https://github.com/blumamir))

### :rocket: Enhancement

* Other
  * [#265](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/265) feat: Add GitHub Actions Resource Detector ([@smithclay](https://github.com/smithclay))
  * [#268](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/268) fix: missing .fields() method in jaeger propagator ([@jtmalinowski](https://github.com/jtmalinowski))
* `opentelemetry-host-metrics`
  * [#266](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/266) chore: refactoring host metrics, aligning with semantic conventions ([@obecny](https://github.com/obecny))

### :house: Internal

* `opentelemetry-host-metrics`, `opentelemetry-test-utils`
  * [#283](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/283) chore: update to OTel v0.14.0 ([@Flarna](https://github.com/Flarna))
  * [#277](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/277) updating to core v.0.13.0 ([@obecny](https://github.com/obecny))
* Other
  * [#259](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/259) fix(plugin-document-load): check if getEntriesByType is available before using it ([@mhennoch](https://github.com/mhennoch))
  * [#257](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/257) docs(readme): add @opentelemetry/instrumentation-graphql ([@Hongbo-Miao](https://github.com/Hongbo-Miao))

### Committers: 7

* Amir Blum ([@blumamir](https://github.com/blumamir))
* Bartlomiej Obecny ([@obecny](https://github.com/obecny))
* Clay Smith ([@smithclay](https://github.com/smithclay))
* Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
* Hongbo Miao ([@Hongbo-Miao](https://github.com/Hongbo-Miao))
* Jakub Malinowski ([@jtmalinowski](https://github.com/jtmalinowski))
* MartenH ([@mhennoch](https://github.com/mhennoch))

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

For details about this release and all previous releases, see https://github.com/open-telemetry/opentelemetry-js/blob/main/CHANGELOG.md
