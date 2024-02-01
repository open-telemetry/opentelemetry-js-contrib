# Changelog

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.37.2...instrumentation-aws-sdk-v0.38.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))


### Bug Fixes

* **instrumentation-aws-sdk:** make empty context when SQS message has no propagation fields ([#1889](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1889)) ([577a291](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/577a291cd527606b331d6732ba0eccc75422a0fc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.5 to ^0.30.6
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.1 to ^0.36.0

## [0.37.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.37.1...instrumentation-aws-sdk-v0.37.2) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.4 to ^0.30.5
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.35.0 to ^0.35.1

## [0.37.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.37.0...instrumentation-aws-sdk-v0.37.1) (2023-12-07)


### Bug Fixes

* **instrumentation-aws-sdk:** remove un-sanitised db.statement span attribute from DynamoDB spans ([#1748](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1748)) ([cdbb29f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cdbb29f034218ca14d45d60ab77f33546a37dbaa))

## [0.37.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.36.2...instrumentation-aws-sdk-v0.37.0) (2023-11-22)


### ⚠ BREAKING CHANGES

* **instrumentation-aws-sdk:** Capture full ARN for span attribute messaging.destination.name for SNS topics ([#1727](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1727))

### Features

* **instrumentation-aws-sdk:** Capture full ARN for span attribute messaging.destination.name for SNS topics ([#1727](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1727)) ([28ea3b6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/28ea3b6d9d4ddb3b6d635a7d7b26b0721cf448db))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.3 to ^0.30.4
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.3 to ^0.35.0

## [0.36.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.36.1...instrumentation-aws-sdk-v0.36.2) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.2 to ^0.30.3
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.2 to ^0.34.3

## [0.36.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.36.0...instrumentation-aws-sdk-v0.36.1) (2023-10-10)


### Bug Fixes

* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.1 to ^0.30.2
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.1 to ^0.34.2

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.35.0...instrumentation-aws-sdk-v0.36.0) (2023-08-14)


### Features

* Add capacity information when applicable to dynamodb spans ([#1365](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1365)) ([ad94c5c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ad94c5c4fcb1125e91bcaf365365954944b6f9db))


### Bug Fixes

* **aws-sdk-instrumentation:** Patch new smithy client and middleware packages ([#1626](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1626)) ([3f2bfe8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3f2bfe8ed6feada3f1acc23677862501e8c06304))
* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* fix typescript compilation issue with koa types ([a53f643](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a53f6438d616a6e07b35ff98d063e520adfda5d0))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.30.0 to ^0.30.1
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.34.0 to ^0.34.1

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.34.3...instrumentation-aws-sdk-v0.35.0) (2023-07-12)


### Features

* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))
* **opentelemetry-instrumentation-aws-sdk:** add missing spec-defined DynamoDB attributes ([#1524](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1524)) ([f7c4324](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f7c432495dc04b02f7279c543bb4565f4f111134))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.5 to ^0.30.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.4 to ^0.34.0

## [0.34.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.34.2...instrumentation-aws-sdk-v0.34.3) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.4 to ^0.29.5
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.3 to ^0.33.4

## [0.34.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.34.1...instrumentation-aws-sdk-v0.34.2) (2023-05-16)


### Bug Fixes

* **aws-sdk:** correct setting error in attributes ([#1495](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1495)) ([5f87026](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f87026433950b40abb50fa819a163087b9a123b))
* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))
* **eslint-eqeqeq:** updated the `eqeqeq` rule to match the core repo ([#1485](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1485)) ([5709008](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5709008dfa4d05cae0c2226b9926e36cdf60c631))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.3 to ^0.29.4
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.2 to ^0.33.3

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.34.0...instrumentation-aws-sdk-v0.34.1) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.2 to ^0.29.3
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.1 to ^0.33.2

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.33.0...instrumentation-aws-sdk-v0.34.0) (2023-02-07)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* AWS-SDK SNS Context propagation ([#728](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/728)) ([78cd4e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/78cd4e118e5a41107d84dfd1ae8c4c28e885b27e))
* **aws-sdk:** add http status code attribute to aws sdk span ([#844](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/844)) ([09b8555](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/09b8555007c3c05ad046dd67925f3640a7b35fbe))
* **aws-sdk:** lambda client instrumentation ([#916](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/916)) ([dc6c2b5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dc6c2b5121977814f854b674ec3e519f689637c9))
* config option to extract sqs context from message payload ([#737](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/737)) ([28e2113](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/28e2113ec1091e73a1d1b62b48fee8c01c72afee))
* **instrumentation-aws-sdk:** upstream aws-sdk instrumentation from ext-js ([#678](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/678)) ([f5851e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f5851e72512117dbce571a42930a90c560dbf63d))
* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))
* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))
* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))
* upstream mocha instrumentation testing plugin from ext-js [#621](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/621) ([#669](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/669)) ([a5170c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a5170c494706a2bec3ba51e59966d0ca8a41d00e))
* use latest instrumentation base ([#769](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* avoid type imports of the aws-sdk package in the built assets ([#1066](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1066)) ([457be50](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/457be5035b9ba87211fe3553c901b7408dd2d593))
* **aws-sdk:** avoid repeating MessageAttributeNames in sqs receiveMessage ([#1044](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1044)) ([4b4ded6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4b4ded6e5b781b9a9cb2c55102ec0949da062511))
* **aws-sdk:** bump aws-sdk instrumentation version to align with previous release ([#1247](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1247)) ([fd2480a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd2480a4ea7b4093da523ecbc30743a55f38ab6c))
* **aws-sdk:** calc propagation fields count before context inject ([#738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/738)) ([033cc1f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/033cc1f7ed09c33e401b9514ed30d1160cf58899))
* **aws-sdk:** set spanKind to CLIENT by default in v3 ([#1177](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1177)) ([d463695](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d463695f5258875f1da0c7b17c20f7df93494d4e))
* **aws-sdk:** sns span name should be with low cardinality ([#841](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/841)) ([7032a33](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7032a33b6eef331ab327ab57b9bd3a1aed361fb2))
* **aws-sdk:** sns-sqs extract the correct context key from message payload  ([#761](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/761)) ([e5cae76](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5cae76d90b5e6d2eb9c6cd5da984a07cdd5048c))
* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))
* **instrumentation-aws-sdk:** sqs message id missing on send command ([#968](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/968)) ([8b36fe1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8b36fe16abca0a6326d48e5a22fd9302f2936609))
* **opentelemetry-instrumentation-aws-sdk:** error when ReturnConsumedCapacity is set to None ([#899](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/899)) ([e7ab4d0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e7ab4d056b6663f593b47af7c3e8014a72a963fe))
* rename lerna's --include-filtered-dependencies option ([#817](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* **sns-publish-test-v3:** add test for sns.publish for aws sdk v3 ([#1015](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1015)) ([0293d89](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0293d897f789bdeb7b843f673be2c2dc62e16010))
* use localhost for services in CI ([#816](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.1 to ^0.29.2
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.33.0 to ^0.33.1

## [0.10.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.9.3...instrumentation-aws-sdk-v0.10.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.29.0 to ^0.29.1
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.32.0 to ^0.33.0

## [0.9.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.9.2...instrumentation-aws-sdk-v0.9.3) (2022-11-02)


### Bug Fixes

* **aws-sdk:** bump aws-sdk instrumentation version to align with previous release ([#1247](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1247)) ([fd2480a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd2480a4ea7b4093da523ecbc30743a55f38ab6c))

## [0.9.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.9.1...instrumentation-aws-sdk-v0.9.2) (2022-09-27)


### Bug Fixes

* **aws-sdk:** set spanKind to CLIENT by default in v3 ([#1177](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1177)) ([d463695](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d463695f5258875f1da0c7b17c20f7df93494d4e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.28.0 to ^0.29.0

## [0.9.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.9.0...instrumentation-aws-sdk-v0.9.1) (2022-09-15)


### Bug Fixes

* avoid type imports of the aws-sdk package in the built assets ([#1066](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1066)) ([457be50](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/457be5035b9ba87211fe3553c901b7408dd2d593))

## [0.9.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.8.1...instrumentation-aws-sdk-v0.9.0) (2022-09-02)


### Features

* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.31.0 to ^0.32.0

## [0.8.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.8.0...instrumentation-aws-sdk-v0.8.1) (2022-06-17)


### Bug Fixes

* **aws-sdk:** avoid repeating MessageAttributeNames in sqs receiveMessage ([#1044](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1044)) ([4b4ded6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4b4ded6e5b781b9a9cb2c55102ec0949da062511))

## [0.8.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.7.0...instrumentation-aws-sdk-v0.8.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.30.0 to ^0.31.0

## [0.7.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.6.0...instrumentation-aws-sdk-v0.7.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* **instrumentation-aws-sdk:** sqs message id missing on send command ([#968](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/968)) ([8b36fe1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8b36fe16abca0a6326d48e5a22fd9302f2936609))
* **sns-publish-test-v3:** add test for sns.publish for aws sdk v3 ([#1015](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1015)) ([0293d89](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0293d897f789bdeb7b843f673be2c2dc62e16010))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from 0.27.0 to ^0.28.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from 0.29.0 to ^0.30.0

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.5.1...instrumentation-aws-sdk-v0.6.0) (2022-03-14)


### Features

* **aws-sdk:** lambda client instrumentation ([#916](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/916)) ([dc6c2b5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dc6c2b5121977814f854b674ec3e519f689637c9))

### [0.5.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.5.0...instrumentation-aws-sdk-v0.5.1) (2022-03-02)


### Bug Fixes

* **opentelemetry-instrumentation-aws-sdk:** error when ReturnConsumedCapacity is set to None ([#899](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/899)) ([e7ab4d0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e7ab4d056b6663f593b47af7c3e8014a72a963fe))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagation-utils bumped from ^0.26.0 to ^0.27.0

## [0.5.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.4.0...instrumentation-aws-sdk-v0.5.0) (2022-01-24)


### Features

* **aws-sdk:** add http status code attribute to aws sdk span ([#844](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/844)) ([09b8555](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/09b8555007c3c05ad046dd67925f3640a7b35fbe))


### Bug Fixes

* **aws-sdk:** calc propagation fields count before context inject ([#738](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/738)) ([033cc1f](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/033cc1f7ed09c33e401b9514ed30d1160cf58899))
* **aws-sdk:** sns span name should be with low cardinality ([#841](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/841)) ([7032a33](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7032a33b6eef331ab327ab57b9bd3a1aed361fb2))
* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.28.0 to ^0.29.0

## [0.4.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.3.1...instrumentation-aws-sdk-v0.4.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.27.0 to ^0.28.0

### [0.3.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.3.0...instrumentation-aws-sdk-v0.3.1) (2021-11-30)


### Bug Fixes

* **aws-sdk:** sns-sqs extract the correct context key from message payload  ([#761](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/761)) ([e5cae76](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/e5cae76d90b5e6d2eb9c6cd5da984a07cdd5048c))

## [0.3.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.2.0...instrumentation-aws-sdk-v0.3.0) (2021-11-19)


### Features

* config option to extract sqs context from message payload ([#737](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/737)) ([28e2113](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/28e2113ec1091e73a1d1b62b48fee8c01c72afee))

## [0.2.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.1.0...instrumentation-aws-sdk-v0.2.0) (2021-11-12)


### Features

* AWS-SDK SNS Context propagation ([#728](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/728)) ([78cd4e1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/78cd4e118e5a41107d84dfd1ae8c4c28e885b27e))

## 0.1.0 (2021-10-22)


### Features

* **instrumentation-aws-sdk:** upstream aws-sdk instrumentation from ext-js ([#678](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/678)) ([f5851e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f5851e72512117dbce571a42930a90c560dbf63d))



### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.26.0 to ^0.27.0
