# Changelog

## [0.36.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.36.0...instrumentation-express-v0.36.1) (2024-03-11)


### Bug Fixes

* **instr-express:** normalize paths with double slashes ([#1995](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1995)) ([65a9553](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65a9553e76a3e61da71c31758b6e5320f286374b))

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.35.0...instrumentation-express-v0.36.0) (2024-03-06)


### Features

* **deps:** update otel-js to 1.22.0/0.49.1 ([edc426b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/edc426b348bc5f45ff6816bcd5ea7473251a05df))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.36.0 to ^0.37.0

## [0.35.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.34.1...instrumentation-express-v0.35.0) (2024-01-29)


### Features

* **deps:** update otel-js to 1.21.0/0.48.0 ([9624486](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/96244869d0fe22e6006fa6ef5e54839e06afb99d))


### Bug Fixes

* span emit warnings on express instrumentation ([#1891](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1891)) ([f65f2f1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f65f2f1482f6f9ca80681f09249dc2b75ef7e3db))

## [0.34.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.34.0...instrumentation-express-v0.34.1) (2024-01-04)


### Bug Fixes

* **deps:** update otel core experimental ([#1866](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1866)) ([9366543](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9366543f5572e1e976ce176ddeb0b438f6c16c45))

## [0.34.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.33.3...instrumentation-express-v0.34.0) (2023-12-07)


### ⚠ BREAKING CHANGES

* **instrumentation-express:** remove `@types/express` from dependencies ([#1804](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1804))

### Features

* **express:** record exceptions ([#1657](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1657)) ([4ca1862](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4ca18626610c0ee3da38807da82c753b8763af95))


### Bug Fixes

* **instrumentation-express:** remove `@types/express` from dependencies ([#1804](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1804)) ([86a21d7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/86a21d7b4ce289dc986925ad73ffd6f0618bb5c7)), closes [#1787](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1787)

## [0.33.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.33.2...instrumentation-express-v0.33.3) (2023-11-13)


### Bug Fixes

* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))

## [0.33.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.33.1...instrumentation-express-v0.33.2) (2023-10-10)


### Bug Fixes

* **deps:** update all patch versions ([#1687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1687)) ([47301c0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47301c038e4dc7d24797cb0b8426033ecc0374e6))
* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))

## [0.33.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.33.0...instrumentation-express-v0.33.1) (2023-08-14)


### Bug Fixes

* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* **express:** make rpcMetadata.route capture the last layer even when if the last layer is not REQUEST_HANDLER ([#1620](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1620)) ([eeda32a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/eeda32a03a4d75166013188bd0a295a17b2da1dc))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.32.4...instrumentation-express-v0.33.0) (2023-07-12)


### Features

* **express:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1557](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1557)) ([8e2f518](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8e2f518d668bb5e0382e1e071bac0213b57142a0))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))


### Bug Fixes

* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))

## [0.32.4](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.32.3...instrumentation-express-v0.32.4) (2023-06-12)


### Bug Fixes

* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))

## [0.32.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.32.2...instrumentation-express-v0.32.3) (2023-05-16)


### Bug Fixes

* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))

## [0.32.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.32.1...instrumentation-express-v0.32.2) (2023-04-25)


### Bug Fixes

* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))

## [0.32.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.32.0...instrumentation-express-v0.32.1) (2023-02-07)


### Bug Fixes

* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.3...instrumentation-express-v0.32.0) (2022-11-16)


### Features

* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))

## [0.31.3](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.2...instrumentation-express-v0.31.3) (2022-11-02)


### Bug Fixes

* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))

## [0.31.2](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.1...instrumentation-express-v0.31.2) (2022-09-28)


### Bug Fixes

* **express:** use the same clock for span start and end ([#1210](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1210)) ([cbeef6e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cbeef6eef7c4ec8801389fdf9787722b89056537))

## [0.31.1](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.31.0...instrumentation-express-v0.31.1) (2022-09-15)


### Bug Fixes

* **readme:** Correct urls to npm ([#1144](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1144)) ([d8767a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d8767a9032dd7fb78b7fdd82f50c1f76e939d33e))

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.30.0...instrumentation-express-v0.31.0) (2022-09-02)


### Features

* **express:** add requestHook support ([#1091](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1091)) ([bcc048b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bcc048b4de1293b0d932ac69dc0b0c056aca13ee))
* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))


### Bug Fixes

* mongodb types fails to compile with latest tsc v4.8 ([#1141](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1141)) ([ec9ee13](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ec9ee131635dc2db88deea4f2efb887ff6f60577))

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.29.0...instrumentation-express-v0.30.0) (2022-06-08)


### Features

* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))

## [0.29.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.28.0...instrumentation-express-v0.29.0) (2022-05-14)


### Features

* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))


### Bug Fixes

* correctly disable Express instrumentation ([#972](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/972)) ([b55b79b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b55b79b72451c65080e01c2ec11655cabd5f65d9))

## [0.28.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.27.1...instrumentation-express-v0.28.0) (2022-02-06)


### Features

* **express:** allow rewriting span names ([#463](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/463)) ([7510757](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7510757aeeee47a7f0c4bb31de45be3a71bb673e))

### [0.27.1](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.27.0...instrumentation-express-v0.27.1) (2022-01-24)


### Bug Fixes

* rename lerna's --include-filtered-dependencies option ([#817](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* use localhost for services in CI ([#816](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))

## [0.27.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.26.0...instrumentation-express-v0.27.0) (2021-11-30)


### Features

* use latest instrumentation base ([#769](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/769)) ([7aff23e](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/7aff23ebebbe209fa3b78c2e7f513c9cd2231be4))

## [0.26.0](https://www.github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.25.0...instrumentation-express-v0.26.0) (2021-10-22)


### Features

* support API and SDK 1.0 ([#706](https://www.github.com/open-telemetry/opentelemetry-js-contrib/issues/706)) ([096b694](https://www.github.com/open-telemetry/opentelemetry-js-contrib/commit/096b694bbc3079f0ab4ee0462869b10eb8185202))
