# Changelog

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
