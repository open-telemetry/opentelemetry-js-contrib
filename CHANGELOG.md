<!-- markdownlint-disable -->
# CHANGELOG

As of v0.25.1 (2022-01-24) changelog content has moved to separate CHANGELOG.md files for each package. Use [this search for a list of all CHANGELOG.md files in this repo](https://github.com/search?q=repo%3Aopen-telemetry%2Fopentelemetry-js-contrib+path%3A**%2FCHANGELOG.md&type=code).

## Unreleased

## 0.25.0

#### :bug: Bug Fix
* [#619](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/619) fix: GraphQL throws TypeError: Cannot read property 'startToken' of undefined ([@obecny](https://github.com/obecny))
* [#643](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/643) fix(user-interaction): event listeners have wrong this when listening for bubbled events ([@t2t2](https://github.com/t2t2))
* [#562](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/562) fix(mysql): bind get connection callback to active context ([@sstone1](https://github.com/sstone1))
* [#589](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/589) fix(hapi-instrumentation): close spans on errors in instrumented functions ([@CptSchnitz](https://github.com/CptSchnitz))
* [#580](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/580) fix: redis instrumentation loses context when using callbacks ([@aspectom](https://github.com/aspectom))

#### :rocket: Enhancement
* Other
  * [#626](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/626) feat(mongodb): add db statement serializer config ([@nozik](https://github.com/nozik))
  * [#622](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/622) docs: add missing fetch instrumentation ([@meteorlxy](https://github.com/meteorlxy))
  * [#553](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/553) feat: Add NestJS instrumentation ([@Rauno56](https://github.com/Rauno56))
  * [#588](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/588) chore: adding instrumentation for connect ([@obecny](https://github.com/obecny))
* `opentelemetry-test-utils`
  * [#593](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/593) feat: move aws/gcp detectors from opentelemetry-js repo ([@legendecas](https://github.com/legendecas))

#### :house: Internal
* `opentelemetry-test-utils`
  * [#641](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/641) chore(mysql2): adding TAV script ([@YanivD](https://github.com/YanivD))
  * [#639](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/639) build(test-utils): marking test-utils as non private so it can be published ([@blumamir](https://github.com/blumamir))
  * [#596](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/596) docs(test-utils): add README.md for @opentelemetry/test-utils ([@Rauno56](https://github.com/Rauno56))
* Other
  * [#648](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/648) ci: speed up lint workflow with hoisting  ([@YanivD](https://github.com/YanivD))
  * [#614](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/614) ci: speed up PR unit-test run time ([@blumamir](https://github.com/blumamir))
  * [#612](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/612) chore: ignore renovate-bot for component owners ([@dyladan](https://github.com/dyladan))
  * [#597](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/597) chore: add script to update core dependencies ([@dyladan](https://github.com/dyladan))
  * [#606](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/606) chore: add ownership for aws propagator ([@dyladan](https://github.com/dyladan))
  * [#601](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/601) chore: configure renovate to bump API ([@Flarna](https://github.com/Flarna))

#### :memo: Documentation
* `opentelemetry-browser-extension-autoinjection`
  * [#615](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/615) docs: correct the build instructions ([@jessitron](https://github.com/jessitron))

#### Committers: 16
- Amir Blum ([@blumamir](https://github.com/blumamir))
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Herman ([@hermanbanken](https://github.com/hermanbanken))
- Jessica Kerr ([@jessitron](https://github.com/jessitron))
- Ofer Adelstein ([@CptSchnitz](https://github.com/CptSchnitz))
- Ran Nozik ([@nozik](https://github.com/nozik))
- Rauno Viskus ([@Rauno56](https://github.com/Rauno56))
- Simon Stone ([@sstone1](https://github.com/sstone1))
- Tom Zach ([@aspectom](https://github.com/aspectom))
- William Armiros ([@willarmiros](https://github.com/willarmiros))
- Yaniv Davidi ([@YanivD](https://github.com/YanivD))
- legendecas ([@legendecas](https://github.com/legendecas))
- meteorlxy ([@meteorlxy](https://github.com/meteorlxy))
- t2t2 ([@t2t2](https://github.com/t2t2))

## 0.24.0

#### :bug: Bug Fix
* [#573](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/573) chore: fixing express example ([@obecny](https://github.com/obecny))

#### :rocket: Enhancement
* `opentelemetry-browser-extension-autoinjection`, `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#594](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/594) chore: update core deps to 0.24.0 ([@dyladan](https://github.com/dyladan))
* `opentelemetry-host-metrics`
  * [#570](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/570) fix(package.json): publish source maps ([@blumamir](https://github.com/blumamir))
* Other
  * [#571](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/571) fix(instrumentation-hapi): change root span name to route name ([@CptSchnitz](https://github.com/CptSchnitz))
  * [#566](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/566) feat(aws-lambda): added eventContextExtractor config option ([@prsnca](https://github.com/prsnca))

#### :house: Internal
* [#592](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/592) chore(deps): upgrade @types/pino to be compatible with latest sonic-stream types ([@legendecas](https://github.com/legendecas))
* [#583](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/583) style: use single quotes everywhere and add a rule to eslint ([@CptSchnitz](https://github.com/CptSchnitz))
* [#549](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/549) chore: enable typescript 4.3 option noImplicitOverride ([@Flarna](https://github.com/Flarna))

#### Committers: 8
- Amir Blum ([@blumamir](https://github.com/blumamir))
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Daniel Hermon ([@syncush](https://github.com/syncush))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Ofer Adelstein ([@CptSchnitz](https://github.com/CptSchnitz))
- Yaron ([@prsnca](https://github.com/prsnca))
- legendecas ([@legendecas](https://github.com/legendecas))

## 0.23.0

#### :bug: Bug Fix
* [#557](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/557) chore: aligning target for esm build with core repo ([@obecny](https://github.com/obecny))

#### :rocket: Enhancement
* `opentelemetry-browser-extension-autoinjection`
  * [#498](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/498) feat: add browser extension ([@svrnm](https://github.com/svrnm))
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#556](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/556) chore: update core and API ([@dyladan](https://github.com/dyladan))
* Other
  * [#533](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/533) feat(mongo instrumentation): added response hook option ([@prsnca](https://github.com/prsnca))
  * [#546](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/546) feat(aws-lambda): disableAwsContextPropagation config option ([@nirsky](https://github.com/nirsky))
  * [#528](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/528) feat: postgresql responseHook support ([@nata7che](https://github.com/nata7che))
* `opentelemetry-test-utils`
  * [#538](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/538) feat: add cassandra-driver instrumentation ([@seemk](https://github.com/seemk))
  * [#539](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/539) feat: memcached instrumentation ([@Rauno56](https://github.com/Rauno56))

#### :house: Internal
* [#554](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/554) chore: remove unneeded ts-node dev-dependency ([@Flarna](https://github.com/Flarna))

#### Committers: 9
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Nir Hadassi ([@nirsky](https://github.com/nirsky))
- Rauno Viskus ([@Rauno56](https://github.com/Rauno56))
- Severin Neumann ([@svrnm](https://github.com/svrnm))
- Siim Kallas ([@seemk](https://github.com/seemk))
- Yaron ([@prsnca](https://github.com/prsnca))
- natashz ([@nata7che](https://github.com/nata7che))

## 0.22.0

#### :bug: Bug Fix
* [#537](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/537) fix(instrumentation-user-interaction): support clicks in React apps ([@kkruk-sumo](https://github.com/kkruk-sumo))

#### :rocket: Enhancement
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#540](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/540) chore: update core and API ([@dyladan](https://github.com/dyladan))

#### Committers: 2
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Krystian Kruk ([@kkruk-sumo](https://github.com/kkruk-sumo))

## 0.21.0

#### :bug: Bug Fix
* [#524](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/524) [Hapi example] Fix undefined api.statusCode ([@GradedJestRisk](https://github.com/GradedJestRisk))

#### :rocket: Enhancement
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#529](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/529) chore: update core and api to 0.21.0 ([@dyladan](https://github.com/dyladan))
  * [#522](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/522) chore: move api into peer dependency ([@Flarna](https://github.com/Flarna))
* Other
  * [#506](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/506) feat: knex instrumentation ([@Rauno56](https://github.com/Rauno56))
  * [#508](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/508) feat: graphql responseHook support ([@nozik](https://github.com/nozik))
  * [#484](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/484) feat(instrumentation-document-load): performance paint timing events ([@kkruk-sumo](https://github.com/kkruk-sumo))
  * [#510](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/510) chore: add node:16 to the test matrix ([@Rauno56](https://github.com/Rauno56))
  * [#521](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/521) feat: mysql2 instrumentation ([@Rauno56](https://github.com/Rauno56))

#### Committers: 6
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Krystian Kruk ([@kkruk-sumo](https://github.com/kkruk-sumo))
- Ran Nozik ([@nozik](https://github.com/nozik))
- Rauno Viskus ([@Rauno56](https://github.com/Rauno56))
- [@GradedJestRisk](https://github.com/GradedJestRisk)

## 0.20.0

#### :bug: Bug Fix
* [#488](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/488) fix: dns plugin remove hostname attribute ([@svrnm](https://github.com/svrnm))
* [#468](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/468) moving dev dependency for types to main dependency ([@obecny](https://github.com/obecny))

#### :rocket: Enhancement
* Other
  * [#517](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/517) feat: use rpcMetadata to update http span name #464 ([@vmarchaud](https://github.com/vmarchaud))
  * [#441](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/441) feat(instrumentation-document-load): documentLoad attributes enhancement ([@kkruk-sumo](https://github.com/kkruk-sumo))
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#513](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/513) chore: update core to 0.20.0 ([@dyladan](https://github.com/dyladan))
* `opentelemetry-test-utils`
  * [#470](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/470) chore: removing usage of timed event from api ([@obecny](https://github.com/obecny))

#### :house: Internal
* Other
  * [#479](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/479) chore: generalize the instrumentation file name ([@Rauno56](https://github.com/Rauno56))
  * [#481](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/481) fix: move faas_id and cloud_account_id to semantic conventions ([@svrnm](https://github.com/svrnm))
  * [#471](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/471) Fix repository for pg ([@pauldraper](https://github.com/pauldraper))
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#455](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/455) Update gts, eslint, typescript and hapi dependencies ([@Flarna](https://github.com/Flarna))

#### :memo: Documentation
* [#472](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/472) docs: Explicitly state that express instrumentation does not export spans without http instrumentation ([@svrnm](https://github.com/svrnm))
* [#450](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/450) chore: prefer use of global TracerProvider/MeterProvider ([@Flarna](https://github.com/Flarna))

#### Committers: 16
- Amir Blum ([@blumamir](https://github.com/blumamir))
- Anuraag Agrawal ([@anuraaga](https://github.com/anuraaga))
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Krystian Kruk ([@kkruk-sumo](https://github.com/kkruk-sumo))
- Min Xia ([@mxiamxia](https://github.com/mxiamxia))
- Nir Hadassi ([@nirsky](https://github.com/nirsky))
- Paul Draper ([@pauldraper](https://github.com/pauldraper))
- Ran Nozik ([@nozik](https://github.com/nozik))
- Rauno Viskus ([@Rauno56](https://github.com/Rauno56))
- Severin Neumann ([@svrnm](https://github.com/svrnm))
- Siim Kallas ([@seemk](https://github.com/seemk))
- Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))
- William Armiros ([@willarmiros](https://github.com/willarmiros))
- t2t2 ([@t2t2](https://github.com/t2t2))

## 0.16.0

#### :boom: Breaking Change
* `opentelemetry-host-metrics`
  * [#429](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/429) Remove plugins ([@obecny](https://github.com/obecny))

#### :bug: Bug Fix
* [#403](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/403) chore: fixing context propagation on mongo callback ([@obecny](https://github.com/obecny))

#### :rocket: Enhancement
* `opentelemetry-host-metrics`, `opentelemetry-id-generator-aws-xray`, `opentelemetry-test-utils`
  * [#440](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/440) chore: update core to 0.19, api to rc0 ([@dyladan](https://github.com/dyladan))
* `opentelemetry-id-generator-aws-xray`
  * [#423](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/423) feat: add x-ray id generator ([@anuraaga](https://github.com/anuraaga))
* Other
  * [#432](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/432) feat: pino instrumentation ([@seemk](https://github.com/seemk))
  * [#425](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/425) feat: winston instrumentation ([@seemk](https://github.com/seemk))
  * [#416](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/416) feat: restify instrumentation ([@Rauno56](https://github.com/Rauno56))
  * [#419](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/419) feat: bunyan instrumentation ([@seemk](https://github.com/seemk))

#### :house: Internal
* `opentelemetry-host-metrics`, `opentelemetry-test-utils`
  * [#437](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/437) chore: clean some unused deps ([@Rauno56](https://github.com/Rauno56))
* Other
  * [#434](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/434) chore: clean up images from restify example ([@Rauno56](https://github.com/Rauno56))

#### :memo: Documentation
* [#413](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/413) document: fix express example ([@Rauno56](https://github.com/Rauno56))

#### Committers: 9
- Anuraag Agrawal ([@anuraaga](https://github.com/anuraaga))
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Rauno Viskus ([@Rauno56](https://github.com/Rauno56))
- Severin Neumann ([@svrnm](https://github.com/svrnm))
- Siim Kallas ([@seemk](https://github.com/seemk))
- Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))
- William Armiros ([@willarmiros](https://github.com/willarmiros))
- [@gregoryfranklin](https://github.com/gregoryfranklin)

## 0.15.0

#### :rocket: Enhancement
* Other
  * [#366](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/366) Add automated release workflows ([@willarmiros](https://github.com/willarmiros))
* `auto-instrumentation-web`
  * [#391](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/391) chore: adding meta package for web ([@obecny](https://github.com/obecny))
* `auto-instrumentation-node`
  * [#379](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/379) chore: creating meta package for default auto instrumentations for node ([@obecny](https://github.com/obecny))
* `opentelemetry-instrumentation-hapi`
  * [#380](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/380) Moving Hapi Plugin to Instrumentation ([@obecny](https://github.com/obecny))
* `opentelemetry-instrumentation-koa`
  * [#327](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/327) feat: enable root span to contain route ([@DinaYakovlev](https://github.com/DinaYakovlev))
* `opentelemetry-instrumentation-mysql`
  * [#393](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/393) feat: mysql instrumentation ([@dyladan](https://github.com/dyladan))
* `opentelemetry-instrumentation-net`
  * [#389](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/389) feat: net module instrumentation ([@seemk](https://github.com/seemk))
* `opentelemetry-host-metrics`
  * [#395](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/395) chore: fixing broken links, updating to correct base url, replacing gitter with github discussions ([@obecny](https://github.com/obecny))

#### :house: Internal
* `opentelemetry-host-metrics`, `opentelemetry-test-utils`
  * [#408](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/408) chore: bump otel dependencies to latest patch ([@dyladan](https://github.com/dyladan))
* Other
  * [#392](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/392) chore: fixing broken links ([@obecny](https://github.com/obecny))

#### :memo: Documentation
* `opentelemetry-host-metrics`
  * [#373](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/373) Update README.md ([@z1c0](https://github.com/z1c0))

#### Committers: 9
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Daniel Dyla ([@dyladan](https://github.com/dyladan))
- Dina.Yakovlev ([@DinaYakovlev](https://github.com/DinaYakovlev))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- Jakub Malinowski ([@jtmalinowski](https://github.com/jtmalinowski))
- Siim Kallas ([@seemk](https://github.com/seemk))
- Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))
- William Armiros ([@willarmiros](https://github.com/willarmiros))
- Wolfgang Ziegler ([@z1c0](https://github.com/z1c0))

## 0.14.0

### :bug: Bug Fix

* [#367](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/367) docs(readme): fix links ([@Hongbo-Miao](https://github.com/Hongbo-Miao))

### :rocket: Enhancement

* [#354](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/354) refactor: migrate mongodb to instrumentation #250 ([@vmarchaud](https://github.com/vmarchaud))
* [#381](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/381) chore: fixing the graphql example and allowing support version of graph from ver 14 ([@obecny](https://github.com/obecny))
* [#372](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/372) feat(instrumentation-ioredis): add requireParentSpan option to config ([@blumamir](https://github.com/blumamir))

### :house: Internal
* [#371](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/371) chore: bump core to 0.18 ([@dyladan](https://github.com/dyladan))

### Committers: 5

* Amir Blum ([@blumamir](https://github.com/blumamir))
* Bartlomiej Obecny ([@obecny](https://github.com/obecny))
* Daniel Dyla ([@dyladan](https://github.com/dyladan))
* Hongbo Miao ([@Hongbo-Miao](https://github.com/Hongbo-Miao))
* Valentin Marchaud ([@vmarchaud](https://github.com/vmarchaud))

## 0.13.1

#### :rocket: Enhancement
* [#330](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/330) Allow negative performance timings ([@mhennoch](https://github.com/mhennoch))
* [#302](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/302) feat: add instrumentation-dns ([@Flarna](https://github.com/Flarna))
* [#301](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/301) feat: add ioredis instrumentation ([@Flarna](https://github.com/Flarna))
* [#324](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/324) User interaction instrumentation ([@obecny](https://github.com/obecny))

#### :house: Internal
* [#328](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/328) added github workflow for unit tests ([@willarmiros](https://github.com/willarmiros))

#### Committers: 4
- Bartlomiej Obecny ([@obecny](https://github.com/obecny))
- Gerhard Stöbich ([@Flarna](https://github.com/Flarna))
- MartenH ([@mhennoch](https://github.com/mhennoch))
- William Armiros ([@willarmiros](https://github.com/willarmiros))

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
