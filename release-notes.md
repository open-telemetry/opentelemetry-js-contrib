:robot: I have created a release *beep* *boop*
---


<details><summary>auto-configuration-propagators: 0.5.0</summary>

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/auto-configuration-propagators-v0.4.6...auto-configuration-propagators-v0.5.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))
* **auto-configuration-propagators:** remove jaeger propagator support ([#3741](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3741))

### Features

* **auto-configuration-propagators:** remove jaeger propagator support ([#3741](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3741)) ([a4f5d9b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a4f5d9bb87ba8aa15965f637ce4b5ab6cd612699))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^2.2.0 to ^3.0.0
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.56.0 to ^0.57.0
    * @opentelemetry/propagator-ot-trace bumped from ^0.29.0 to ^0.30.0
</details>

<details><summary>auto-instrumentations-node: 0.81.0</summary>

## [0.81.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/auto-instrumentations-node-v0.80.0...auto-instrumentations-node-v0.81.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/instrumentation-amqplib bumped from ^0.69.0 to ^0.70.0
    * @opentelemetry/instrumentation-aws-lambda bumped from ^0.74.0 to ^0.75.0
    * @opentelemetry/instrumentation-aws-sdk bumped from ^0.77.0 to ^0.78.0
    * @opentelemetry/instrumentation-bunyan bumped from ^0.67.0 to ^0.68.0
    * @opentelemetry/instrumentation-cassandra-driver bumped from ^0.67.0 to ^0.68.0
    * @opentelemetry/instrumentation-connect bumped from ^0.65.0 to ^0.66.0
    * @opentelemetry/instrumentation-cucumber bumped from ^0.38.0 to ^0.39.0
    * @opentelemetry/instrumentation-dataloader bumped from ^0.39.0 to ^0.40.0
    * @opentelemetry/instrumentation-dns bumped from ^0.65.0 to ^0.66.0
    * @opentelemetry/instrumentation-express bumped from ^0.70.0 to ^0.71.0
    * @opentelemetry/instrumentation-fs bumped from ^0.41.0 to ^0.42.0
    * @opentelemetry/instrumentation-generic-pool bumped from ^0.65.0 to ^0.66.0
    * @opentelemetry/instrumentation-graphql bumped from ^0.70.0 to ^0.71.0
    * @opentelemetry/instrumentation-hapi bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-host-metrics bumped from ^0.5.0 to ^0.6.0
    * @opentelemetry/instrumentation-ioredis bumped from ^0.70.0 to ^0.71.0
    * @opentelemetry/instrumentation-kafkajs bumped from ^0.31.0 to ^0.32.0
    * @opentelemetry/instrumentation-knex bumped from ^0.66.0 to ^0.67.0
    * @opentelemetry/instrumentation-koa bumped from ^0.70.0 to ^0.71.0
    * @opentelemetry/instrumentation-lru-memoizer bumped from ^0.66.0 to ^0.67.0
    * @opentelemetry/instrumentation-memcached bumped from ^0.65.0 to ^0.66.0
    * @opentelemetry/instrumentation-mongodb bumped from ^0.75.0 to ^0.76.0
    * @opentelemetry/instrumentation-mongoose bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-mysql bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-mysql2 bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-nestjs-core bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-net bumped from ^0.66.0 to ^0.67.0
    * @opentelemetry/instrumentation-openai bumped from ^0.20.0 to ^0.21.0
    * @opentelemetry/instrumentation-oracledb bumped from ^0.47.0 to ^0.48.0
    * @opentelemetry/instrumentation-pg bumped from ^0.74.0 to ^0.75.0
    * @opentelemetry/instrumentation-pino bumped from ^0.68.0 to ^0.69.0
    * @opentelemetry/instrumentation-redis bumped from ^0.70.0 to ^0.71.0
    * @opentelemetry/instrumentation-restify bumped from ^0.67.0 to ^0.68.0
    * @opentelemetry/instrumentation-router bumped from ^0.66.0 to ^0.67.0
    * @opentelemetry/instrumentation-runtime-node bumped from ^0.35.0 to ^0.36.0
    * @opentelemetry/instrumentation-socket.io bumped from ^0.69.0 to ^0.70.0
    * @opentelemetry/instrumentation-tedious bumped from ^0.41.0 to ^0.42.0
    * @opentelemetry/instrumentation-undici bumped from ^0.32.0 to ^0.33.0
    * @opentelemetry/instrumentation-winston bumped from ^0.66.0 to ^0.67.0
    * @opentelemetry/resource-detector-alibaba-cloud bumped from ^0.37.0 to ^0.38.0
    * @opentelemetry/resource-detector-aws bumped from ^2.22.0 to ^3.0.0
    * @opentelemetry/resource-detector-azure bumped from ^0.30.0 to ^0.31.0
    * @opentelemetry/resource-detector-container bumped from ^0.8.13 to ^0.9.0
    * @opentelemetry/resource-detector-gcp bumped from ^0.57.0 to ^0.58.0
</details>

<details><summary>auto-instrumentations-web: 0.68.0</summary>

## [0.68.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/auto-instrumentations-web-v0.67.0...auto-instrumentations-web-v0.68.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/instrumentation-document-load bumped from ^0.67.0 to ^0.68.0
    * @opentelemetry/instrumentation-user-interaction bumped from ^0.66.0 to ^0.67.0
</details>

<details><summary>baggage-log-record-processor: 0.24.0</summary>

## [0.24.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/baggage-log-record-processor-v0.23.0...baggage-log-record-processor-v0.24.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>baggage-span-processor: 0.6.0</summary>

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/baggage-span-processor-v0.5.0...baggage-span-processor-v0.6.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>contrib-test-utils: 0.70.0</summary>

## [0.70.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/contrib-test-utils-v0.69.0...contrib-test-utils-v0.70.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>genai-util: 0.2.0</summary>

## [0.2.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/genai-util-v0.1.0...genai-util-v0.2.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Features

* **genai-util:** accept structured InvocationError in fail() ([#3772](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3772)) ([d666b7d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d666b7de6bb6e0b366087c97990d498bf4738457))
* **genai-util:** add base invocation lifecycle and TelemetryHandler ([#3757](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3757)) ([999f622](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/999f622818d1ea78b53bc8096768796155ea1110))
* **genai-util:** add GenAI metric helpers and histograms ([#3712](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3712)) ([ef0c42d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ef0c42d5e59ace067d9548c398c4010c3285e8e3))
* **genai-util:** scaffold package, types, semconv and core utils ([#3709](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3709)) ([bf0af15](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bf0af15ea83614aaf46697f918b62c37ed5d2390))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>host-metrics: 0.40.0</summary>

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/host-metrics-v0.39.0...host-metrics-v0.40.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>id-generator-aws-xray: 3.0.0</summary>

## [3.0.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/id-generator-aws-xray-v2.1.0...id-generator-aws-xray-v3.0.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-amqplib: 0.70.0</summary>

## [0.70.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-amqplib-v0.69.0...instrumentation-amqplib-v0.70.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-aws-lambda: 0.75.0</summary>

## [0.75.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-lambda-v0.74.0...instrumentation-aws-lambda-v0.75.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^2.1.4 to ^3.0.0
  * devDependencies
    * @opentelemetry/propagator-aws-xray-lambda bumped from ^0.56.0 to ^0.57.0
</details>

<details><summary>instrumentation-aws-sdk: 0.78.0</summary>

## [0.78.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-aws-sdk-v0.77.0...instrumentation-aws-sdk-v0.78.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-browser-navigation: 0.16.0</summary>

## [0.16.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-browser-navigation-v0.15.0...instrumentation-browser-navigation-v0.16.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-bunyan: 0.68.0</summary>

## [0.68.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-bunyan-v0.67.0...instrumentation-bunyan-v0.68.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-cassandra-driver: 0.68.0</summary>

## [0.68.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-cassandra-driver-v0.67.0...instrumentation-cassandra-driver-v0.68.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-connect: 0.66.0</summary>

## [0.66.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-connect-v0.65.0...instrumentation-connect-v0.66.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-console: 0.5.0</summary>

## [0.5.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-console-v0.4.0...instrumentation-console-v0.5.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-cucumber: 0.39.0</summary>

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-cucumber-v0.38.0...instrumentation-cucumber-v0.39.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-dataloader: 0.40.0</summary>

## [0.40.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dataloader-v0.39.0...instrumentation-dataloader-v0.40.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-dns: 0.66.0</summary>

## [0.66.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-dns-v0.65.0...instrumentation-dns-v0.66.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Bug Fixes

* **instrumentation-dns:** preserve promisified lookup result ([#3706](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3706)) ([f5685ea](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f5685ea68ca9fa1223cb4cd4a7b47df1a31a1a04))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-document-load: 0.68.0</summary>

## [0.68.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-document-load-v0.67.0...instrumentation-document-load-v0.68.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Bug Fixes

* **instrumentation-document-load:** replace deprecated otperformance ([#3727](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3727)) ([59b65c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59b65c4409411dfb32c934790de2c598edba3ec5))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-express: 0.71.0</summary>

## [0.71.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-express-v0.70.0...instrumentation-express-v0.71.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-fs: 0.42.0</summary>

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-fs-v0.41.0...instrumentation-fs-v0.42.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-generic-pool: 0.66.0</summary>

## [0.66.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-generic-pool-v0.65.0...instrumentation-generic-pool-v0.66.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-graphql: 0.71.0</summary>

## [0.71.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-graphql-v0.70.0...instrumentation-graphql-v0.71.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-hapi: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-hapi-v0.68.0...instrumentation-hapi-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-host-metrics: 0.6.0</summary>

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-host-metrics-v0.5.0...instrumentation-host-metrics-v0.6.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-ioredis: 0.71.0</summary>

## [0.71.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-ioredis-v0.70.0...instrumentation-ioredis-v0.71.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.38.3 to ^0.39.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-kafkajs: 0.32.0</summary>

## [0.32.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-kafkajs-v0.31.0...instrumentation-kafkajs-v0.32.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-knex: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-knex-v0.66.0...instrumentation-knex-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-koa: 0.71.0</summary>

## [0.71.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-koa-v0.70.0...instrumentation-koa-v0.71.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-langchain: 0.11.0</summary>

## [0.11.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-langchain-v0.10.0...instrumentation-langchain-v0.11.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Features

* **deps:** update deps matching '@opentelemetry/*' ([#3450](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3450)) ([c8df394](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c8df394f02d68ae48a79a50258682c09dac13b8b))
* **deps:** update deps matching '@opentelemetry/*' ([#3479](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3479)) ([8891261](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8891261cb590efcb661bd9f8afec4d1adf885ad8))
* **deps:** update deps matching '@opentelemetry/*' ([#3497](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3497)) ([a91133a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a91133aa0aac9486eda26f3338d7673851b8bd69))
* **deps:** update deps matching '@opentelemetry/*' ([#3507](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3507)) ([e1ef3d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e1ef3d1b14f177afd738f1c967018c1dc6fc900e))
* **deps:** update deps matching '@opentelemetry/*' ([#3523](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3523)) ([e26a90a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e26a90af6e2fb4666b22388b770add7a60140c9b))
* **deps:** update deps matching '@opentelemetry/*' ([#3567](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3567)) ([bd569b5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bd569b54fbdbf4e7bb915c43ff7c6e88ab451738))
* **deps:** update deps matching '@opentelemetry/*' ([#3593](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3593)) ([6dfb532](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6dfb532ac16889c2f8656f2d9132a290e68cb570))
* **deps:** update deps matching '@opentelemetry/*' ([#3629](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3629)) ([466d5de](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/466d5def474cf251217881322ed4db13fad96b86))
* **deps:** update deps matching '@opentelemetry/*' ([#3716](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3716)) ([015582a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/015582a5b839b942c7a6a0aa8a60d1665b16663f))
* **instrumentation-langchain:** add initial package skeleton for instrumentation-langchain ([#3132](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3132)) ([58285c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/58285c468dee1bd9bf780e519cf2d45efef0dd55))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-long-task: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-long-task-v0.66.0...instrumentation-long-task-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-lru-memoizer: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-lru-memoizer-v0.66.0...instrumentation-lru-memoizer-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-memcached: 0.66.0</summary>

## [0.66.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-memcached-v0.65.0...instrumentation-memcached-v0.66.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-mongodb: 0.76.0</summary>

## [0.76.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongodb-v0.75.0...instrumentation-mongodb-v0.76.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-mongoose: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mongoose-v0.68.0...instrumentation-mongoose-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-mysql: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql-v0.68.0...instrumentation-mysql-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-mysql2: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-mysql2-v0.68.0...instrumentation-mysql2-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/sql-common bumped from ^0.42.0 to ^0.43.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-nestjs-core: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-nestjs-core-v0.68.0...instrumentation-nestjs-core-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Features

* **instrumentation-nestjs-core:** add support for NestJS 12 ([#3733](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3733)) ([7303430](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7303430bd1deb30e337e2a443f888acd557ca730))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-net: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-net-v0.66.0...instrumentation-net-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-openai: 0.21.0</summary>

## [0.21.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-openai-v0.20.0...instrumentation-openai-v0.21.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-oracledb: 0.48.0</summary>

## [0.48.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-oracledb-v0.47.0...instrumentation-oracledb-v0.48.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-pg: 0.75.0</summary>

## [0.75.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pg-v0.74.0...instrumentation-pg-v0.75.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/sql-common bumped from ^0.42.0 to ^0.43.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-pino: 0.69.0</summary>

## [0.69.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-pino-v0.68.0...instrumentation-pino-v0.69.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-redis: 0.71.0</summary>

## [0.71.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-redis-v0.70.0...instrumentation-redis-v0.71.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/redis-common bumped from ^0.38.3 to ^0.39.0
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-restify: 0.68.0</summary>

## [0.68.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-restify-v0.67.0...instrumentation-restify-v0.68.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Features

* **instrumentation-restify:** add support for restify v12 ([#3782](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3782)) ([b3282e4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b3282e4143711bfbe6a77c988b241b286dfccf89))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-router: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-router-v0.66.0...instrumentation-router-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-runtime-node: 0.36.0</summary>

## [0.36.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-runtime-node-v0.35.0...instrumentation-runtime-node-v0.36.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-sequelize: 0.16.0</summary>

## [0.16.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-sequelize-v0.15.0...instrumentation-sequelize-v0.16.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-socket.io: 0.70.0</summary>

## [0.70.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-socket.io-v0.69.0...instrumentation-socket.io-v0.70.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-tedious: 0.42.0</summary>

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-tedious-v0.41.0...instrumentation-tedious-v0.42.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-typeorm: 0.23.0</summary>

## [0.23.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-typeorm-v0.22.0...instrumentation-typeorm-v0.23.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>instrumentation-undici: 0.33.0</summary>

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-undici-v0.32.0...instrumentation-undici-v0.33.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Features

* **instrumentation-undici:** set network.protocol.version on client spans ([#3737](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3737)) ([5bd1049](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5bd1049ed3c3092b9bf9720b79660d427607b3f7))


### Bug Fixes

* **instrumentation-undici:** add `error.type` span attribute for requests that fail without a server response ([#3736](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3736)) ([97d88a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/97d88a94f679d967eafb6fa0480464d0215366ba))
* **instrumentation-undici:** add error.type to spans and metrics ([#3731](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3731)) ([914f249](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/914f249a07ba56b87d359b793340a3673acef32d))


### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-user-interaction: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-user-interaction-v0.66.0...instrumentation-user-interaction-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-web-exception: 0.16.0</summary>

## [0.16.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-web-exception-v0.15.0...instrumentation-web-exception-v0.16.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>instrumentation-winston: 0.67.0</summary>

## [0.67.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/instrumentation-winston-v0.66.0...instrumentation-winston-v0.67.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/winston-transport bumped from ^0.32.0 to ^0.33.0
</details>

<details><summary>propagator-aws-xray: 3.0.0</summary>

## [3.0.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-aws-xray-v2.2.0...propagator-aws-xray-v3.0.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>propagator-aws-xray-lambda: 0.57.0</summary>

## [0.57.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-aws-xray-lambda-v0.56.0...propagator-aws-xray-lambda-v0.57.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @opentelemetry/propagator-aws-xray bumped from ^2.2.0 to ^3.0.0
</details>

<details><summary>propagator-instana: 0.6.0</summary>

## [0.6.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-instana-v0.5.0...propagator-instana-v0.6.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>propagator-ot-trace: 0.30.0</summary>

## [0.30.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/propagator-ot-trace-v0.29.0...propagator-ot-trace-v0.30.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>redis-common: 0.39.0</summary>

## [0.39.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/redis-common-v0.38.3...redis-common-v0.39.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>resource-detector-alibaba-cloud: 0.38.0</summary>

## [0.38.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-alibaba-cloud-v0.37.0...resource-detector-alibaba-cloud-v0.38.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>resource-detector-aws: 3.0.0</summary>

## [3.0.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-aws-v2.22.0...resource-detector-aws-v3.0.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
    * @opentelemetry/instrumentation-fs bumped from ^0.41.0 to ^0.42.0
</details>

<details><summary>resource-detector-azure: 0.31.0</summary>

## [0.31.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-azure-v0.30.0...resource-detector-azure-v0.31.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>resource-detector-container: 0.9.0</summary>

## [0.9.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-container-v0.8.13...resource-detector-container-v0.9.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
    * @opentelemetry/instrumentation-fs bumped from ^0.41.0 to ^0.42.0
</details>

<details><summary>resource-detector-gcp: 0.58.0</summary>

## [0.58.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-gcp-v0.57.0...resource-detector-gcp-v0.58.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>resource-detector-github: 0.33.0</summary>

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-github-v0.32.0...resource-detector-github-v0.33.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>resource-detector-instana: 0.42.0</summary>

## [0.42.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/resource-detector-instana-v0.41.0...resource-detector-instana-v0.42.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @opentelemetry/contrib-test-utils bumped from ^0.69.0 to ^0.70.0
</details>

<details><summary>sampler-aws-xray: 0.4.0</summary>

## [0.4.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/sampler-aws-xray-v0.3.0...sampler-aws-xray-v0.4.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>sql-common: 0.43.0</summary>

## [0.43.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/sql-common-v0.42.0...sql-common-v0.43.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

<details><summary>winston-transport: 0.33.0</summary>

## [0.33.0](https://github.com/open-telemetry/opentelemetry-js-contrib/compare/winston-transport-v0.32.0...winston-transport-v0.33.0) (2026-10-06)


###   BREAKING CHANGES

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789))

### Miscellaneous Chores

* raise minimum supported Node.js to 22.15.0, dropping 18 and 20 support ([#3789](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3789)) ([36dffd2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/36dffd26bbeb0a93f5f51aa7fec9642543227d21))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).