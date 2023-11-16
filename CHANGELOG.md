# CHANGELOG

All notable changes to this project will be documented in this file. Do not remove the "Unreleased" header; it is used in the automated release workflow.

## Unreleased

## 1.0.0 (2023-11-16)


### ⚠ BREAKING CHANGES

* **instrumentation-aws-sdk:** Capture full ARN for span attribute messaging.destination.name for SNS topics ([#1727](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1727))
* **auto-instrumentations-web:** Add zone.js as a peerDependency ([#1768](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1768))
* **mongodb:** removes the broken exported type `V4Connection`.
* **gql:** conform GraphQL span name to spec ([#1444](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1444))
* **ioredis:** net.peer.ip -> db.connection_string
* **mysql*,redis:** net.peer.ip -> db.connection_string

### Features

* Add Azure App Service, Azure Functions, and VM Resource Detectors ([#1740](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1740)) ([1b0caa6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1b0caa61972d969e3baea6a7db365e66dafe0c5d))
* Add capacity information when applicable to dynamodb spans ([#1365](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1365)) ([ad94c5c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ad94c5c4fcb1125e91bcaf365365954944b6f9db))
* add dataloader instrumentation ([#1171](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1171)) ([3898b11](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3898b11800f857c75c286f22c4633b5baf4e1f84))
* add docker resource detector ([#931](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/931)) ([4e31b3c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e31b3cdf0d7c39a1d9f584f1fce2e153d689a2f))
* add esnext target for web instrumentations ([#1776](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1776)) ([2698bb1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2698bb1a5a4de5a5c6272643d6e50180db874d64))
* add Instana propagator ([#1081](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1081)) ([d9546f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d9546f8032494597e443ab879a46b508b58d7243))
* add mongoose instrumentation ([#1131](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1131)) ([b35277b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b35277bb5fc66910e8942bc0b64347b68ecffa26))
* add mysql2 responsehook ([#915](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/915)) ([f436601](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4366015e2a628efc4cb8a47d508ba5620175f88))
* add new instrumentations into `auto-instrumentations-node` ([#981](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/981)) ([a00f390](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a00f390977a3091b068cf1485e7596b4133ea5d8))
* add redis 4 connect span ([#1125](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1125)) ([dbf37fb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dbf37fb99b9168ebd0febc0da0ec21c0082e9967))
* add socket.io instrumentation ([#1284](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1284)) ([f865143](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f865143d9042c41ebed6adbe906097ad7622f2c7))
* add sqlcommenter comment to mysql2 queries ([#1523](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1523)) ([856c252](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/856c25211567104ced8b2a2b56d0818a3c48e671))
* add sqlcommenter comment with trace context to queries in pg instrumentation ([#1286](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1286)) ([a0003e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a0003e76fc46afbbee2558a7d21906be7c9cb1d1))
* add supported node versions for all packages ([#973](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/973)) ([baaacbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/baaacbdd35ca4baab0afae64647aa8c0380ee4b7))
* **add-tav-action:** add test-all-versions as github action ([#778](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/778)) ([77aefa6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/77aefa6ee5eb65ad6dd71ce22fd7800b3eef881d))
* added instana resource detector ([#1084](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1084)) ([845f50c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/845f50c66fc5f3f3e2c45edb4f10829a6e589aa7))
* additional instrumentation debug diagnostics ([#1777](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1777)) ([adbe86d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/adbe86db3a5c7096fdf2fd8cc5ade700ed022a7b))
* amqplib instrumentation ([#892](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/892)) ([f6c16b6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f6c16b6e03f0984af79131e2607b6095350d796c))
* **auto-instrumentations-node:** Add "@opentelemetry/auto-instrumentations-node/register" for an agent-like experience ([#1400](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1400)) ([2d8e2b8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2d8e2b893f9d7987ae5dc00682c59817d3d57fb8))
* **auto-instrumentations-node:** Expose getting resource detectors ([#1772](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1772)) ([89f07d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/89f07d1e1309dc71659a1c52fdddaf59e7e0023e))
* **aws-ecs:** add cloud resource attributes for fargate ([#1543](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1543)) ([de17f77](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/de17f77bd7f75fc2fc8a92d35dfcfbf749b50f71))
* **aws-sdk:** add http status code attribute to aws sdk span ([#844](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/844)) ([09b8555](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/09b8555007c3c05ad046dd67925f3640a7b35fbe))
* **aws-sdk:** lambda client instrumentation ([#916](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/916)) ([dc6c2b5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/dc6c2b5121977814f854b674ec3e519f689637c9))
* **cassandra-responsehook:** added response hook to execute func ([#1180](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1180)) ([20767c4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/20767c4fffee34bc51392894001bbb667576e91d))
* container ID detector for cgroup v2 ([#1181](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1181)) ([502caae](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/502caae17be17e20ee81189dbf79ca25121c7cfe))
* **cucumber:** add instrumentation for @cucumber/cucumber ([#1252](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1252)) ([82267ab](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/82267ab02f8d9b27613b5926089c42d04d4a4a7e))
* **detector-gcp:** collect hostname resource attribute from GCP Metadata API ([#1364](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1364)) ([33c57cc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/33c57cc84a8b87ad3a58dde2014738deab1c375b))
* enable a way to disable amqp tests that require a server running ([#1002](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1002)) ([1c916e4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1c916e488f5ccd9decaf3d022640d22ca9ae5fea))
* **express:** add requestHook support ([#1091](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1091)) ([bcc048b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bcc048b4de1293b0d932ac69dc0b0c056aca13ee))
* **express:** allow rewriting span names ([#463](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/463)) ([7510757](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7510757aeeee47a7f0c4bb31de45be3a71bb673e))
* **express:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1557](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1557)) ([8e2f518](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8e2f518d668bb5e0382e1e071bac0213b57142a0))
* **fastify:** add requestHook support ([#1255](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1255)) ([c9923e3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c9923e3636649c67e5122531f164909b48dbb58d))
* **fastify:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1569](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1569)) ([8d9687d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8d9687d89e4a80dbf2a5e8be6fb027ff20824593))
* **graphql:** add ignoreTrivialResolveSpans config option ([#1256](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1256)) ([aff84bb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aff84bba1d391ec2061b8d0121ac8dd36fc1980c))
* **graphql:** exported all graphql types ([#1097](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1097)) ([710103b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/710103b4d9486fc2e5a9fa567ea1982f218ab4bf))
* **hapi:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1570](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1570)) ([10bdbf7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/10bdbf73a7614236bba916907da8a035ce12db8f))
* **host-metrics:** Add process metrics ([#1449](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1449)) ([9268716](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/92687167f08ea7e3dec046ca7f2be86b337dd743))
* **host-metrics:** update host metrics to collect metrics in batch ([#1450](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1450)) ([6c708d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6c708d116264e395cf5eab94f3ba3250a8585c87))
* **host-metrics:** upgrade api-metrics to v0.28.0 ([#990](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/990)) ([669d34b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/669d34b47e1eabbc99d9584d0d462333d37f4775))
* implement auto-instrumentation for `fs` ([#872](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/872)) ([c3fa161](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c3fa16170f96d18d071a84d75c920a4726ab2825))
* Implement experimental AWS ECS resource attributes ([#1083](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1083)) ([bea8a55](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bea8a554de6ef5678a9968bb0f11c140cba7062a))
* implement instrumentation for `tedious` ([#799](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/799)) ([9326c99](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9326c99f3cdf3e0166f74093a8093066be78bd0a))
* improve pino instrumentation by patching additional exports of the same function ([#1108](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1108)) ([4e4d22e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e4d22eee0e480188b4458b5a859d7cf4b7743d8))
* **instrumenation-document-load:** Add custom attributes to document load ([#1414](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1414)) ([98609c6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/98609c69d951951edcaa3234914d04d7ae87e9b5))
* **instrumentation-aws-lambda:** Adds lambdaHandler config option ([#1627](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1627)) ([c4a8e82](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c4a8e8238d5876c030676fd53cb8718f95653993))
* **instrumentation-aws-sdk:** Capture full ARN for span attribute messaging.destination.name for SNS topics ([#1727](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1727)) ([28ea3b6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/28ea3b6d9d4ddb3b6d635a7d7b26b0721cf448db))
* **instrumentation-dataloader:** add dataloader name to span names ([#1345](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1345)) ([712b559](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/712b559416e0d86ef29ed06d46c180ef8360b411))
* **instrumentation-fs:** require parent span ([#1335](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1335)) ([79b2d3f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/79b2d3ff08904ce84c6bc48427cd98906c2f0d79))
* **instrumentation-lambda:** Flush MeterProvider at end of handler ([#1370](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1370)) ([096129c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/096129c9c1b68c7f6cccbfab42f8d2167bc40927))
* **instrumentation-redis:** add support for redis@^4.0.0 ([#982](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/982)) ([1da0216](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1da0216180de694c15ec356d476f465811757ae4))
* **ioredis:** only serialize non sensitive arguments in db statement attribute ([#1052](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1052)) ([375dfe0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/375dfe07bcd88b8cfb0e6dc291dcc9fd3fba2f9e))
* **ioredis:** Update instrumentation-ioredis to version 5.x.x ([#1121](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1121)) ([f5f7ac6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f5f7ac6196b5422e030a6913c491117a6a3a0690))
* **koa:** add layer type to request hook context ([#1226](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1226)) ([6300733](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6300733ddfa7357546500782d83d63320c134013))
* **koa:** add requestHook support ([#1099](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1099)) ([99279d5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/99279d5085e94c0f6b99d4ffe2858d6d0ff96019))
* **koa:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1567](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1567)) ([825b5a8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/825b5a89cb6e8a667c3fcfb3f25bb954d4c260dc))
* **lambda:** add OTEL_LAMBDA_DISABLE_AWS_CONTEXT_PROPAGATION environment variable ([#1227](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1227)) ([8777cbd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8777cbd3178bb970686488c7e8383d5fa0aaa187))
* Long Tasks instrumentation ([#757](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/757)) ([56d332e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/56d332e58ab2ed35fc11c4b30c8a812dd41670d3))
* **longtasks:** allow callback to add span attributes on collection ([#863](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/863)) ([1f68004](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1f68004ef9b25b0d260159f4b1e2f279b1a64649))
* loosen up peer api check to require dev ver to satisfy peer ver ([#936](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/936)) ([3ad1727](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3ad17277f745a2467fe03ebdf690adb6042112a5))
* **lru-memoizer:** add instrumentation for lru-memoizer ([#1056](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1056)) ([68cf014](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/68cf014a16b47d37436bdc2e90a4be06ae9056bc))
* **minification:** Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545)) ([65f612e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/65f612e35c4d67b9935dc3a9155588b35d915482))
* **mongodb4:** added mongodb4 instrumentation ([#869](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/869)) ([47700e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47700e10dc6e4bd9ba0255cae85dec07ab4dd448))
* **mongodb:** add db.operation span attribute ([#1321](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1321)) ([97305e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/97305e1880ecbfb3b87d6c38f0c6521570583510))
* **mongodb:** collect mongodb4 metrics ([#1170](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1170)) ([988e1f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/988e1f8ea5fbce055d8ef73e40827f750da935d6))
* **mongodb:** support v5 ([#1451](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1451)) ([05c4e9e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/05c4e9ee3e740b3bfba609b3e8a4c02ca7119a1c))
* **mysql2:** support Connection.execute ([#1028](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1028)) ([3e2f9c5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3e2f9c56f4a748a5e63f2f054ec67d5db4b646ab))
* **mysql:** Metrics for mysql ([#1220](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1220)) ([8b8bfeb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8b8bfebdd6b4f43a8df540979874a6c01c999957))
* **opentelemetry-instrumentation-aws-sdk:** add missing spec-defined DynamoDB attributes ([#1524](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1524)) ([f7c4324](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f7c432495dc04b02f7279c543bb4565f4f111134))
* **opentelemetry-instrumentation-document-load:** Add access to performance resource timing object for custom attributes ([#1529](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1529)) ([7c7294c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7c7294ce0591a3c8d4c12b5f135f4fcd24b79762))
* **opentelemetry-instrumentation-fastify:** Support Fastify V4 also ([#1164](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1164)) ([d932d3e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d932d3edcbf41685ca0af546347450fa81444b4e))
* **opentelemetry-sampler-aws-xray:** add x-ray remote sampler ([#1443](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1443)) ([79cd677](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/79cd6773e266927538647240f7ef19fa71b4fb73))
* **pg:** add requireParentSpan option ([#1199](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1199)) ([a6f054d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a6f054de256acc3415deb8137c7ea4bd6926c08d))
* **pg:** remove support for pg v7 ([#1393](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1393)) ([ae6d4f3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ae6d4f39fc882d16e65e846218a69fb72586de3e))
* **pg:** support requestHook hook ([#1307](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1307)) ([f0a9368](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f0a93685cfb43543b7ca577dd370d56576b49e3f))
* **propagation-utils:** end pub-sub process span on promise settled ([#1055](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1055)) ([cb83d30](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cb83d300582b4d485be56563634cd3859069004c))
* **propagator/aws-xray:** Extract X-Ray header in a case-insensitive fashion ([#1328](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1328)) ([4227d8a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4227d8a3df7b0782d76844e89d452e0432a704f4))
* re-enable TAV ([#823](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/823)) ([2e14f46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2e14f46b3f7221ae51ffa12313997f007c300e21))
* remove colors dependency ([#943](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/943)) ([b21b96c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b21b96c1a3a4f871370f970d6b2825f00e1fe595)), closes [#826](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/826)
* **restify:** add requestHook support ([#1312](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1312)) ([4098e6a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4098e6a3d4257e5da9b8cece430bde7d70319cf3))
* **restify:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1571](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1571)) ([7d4b13e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7d4b13eb1391c3fb774254bf651f95a834d0b1c8))
* send log level to pino hook ([#967](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/967)) ([cfb0b7a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cfb0b7a4ffe508563e383b7a186d438186b5c518))
* support `graphql` v16 ([#998](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/998)) ([5da46ef](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5da46ef7a29bbc64f600d794b1e68bb6738a9f2e))
* support baggage propagation in aws lambda custom context extraction ([#843](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/843)) ([da792fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/da792fe3c629354cf9e8faeca48c17e73dffc6be))
* support mysql2 v1 ([#908](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/908)) ([d3883d3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3883d38b7cf929404cf4eac9a9a48b7d1f4327f))
* support using lambda context in the aws lambda context extractor ([#860](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/860)) ([5cb3266](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5cb3266773f3f66d02af3306ae7332288bcae6af))
* **test-utils:** runTestFixture utility for running out-of-process tests ([#1735](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1735)) ([4c8b374](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8b37453225769ec5f7b3c97a2bf0de673bc60f))
* update core dependencies stable ^1.3.1 experimental ^0.29.2 ([141b155](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/141b155e344980b51264e26b26c117b2113bcef6))
* update docker-related scripts and document docker engine prerequisite ([#1329](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1329)) ([8f86ba4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8f86ba4fee0f6af9d8e56b4e1547775738ebff97))
* update experimental deps to `^0.34.0`, core deps to `^1.8.0`, api to `^1.3.0` ([#1278](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1278)) ([e9fe8e1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e9fe8e13e34f54e96c50525cadeb74ac048c5624))
* update experimental Otel deps to ^0.31.0 ([#1096](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1096)) ([4c8843b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4c8843be14896d1159a622c07eb3a049401ccba1))
* update experimental Otel deps to ^0.32.0 ([#1143](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1143)) ([6fb1911](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6fb191139aed2ca763300dcf9adb51121a88f97e))
* update host-metrics to api-metrics v0.27.0 ([#779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/779)) ([9cef8a7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9cef8a7e3a8cb358fd0095b64cbef3874ffee517))
* update webpack outside of examples ([#963](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/963)) ([9a58648](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9a586480ed6a7677fb1283a61d05540345c52617))
* use GA version of metrics ([#1281](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1281)) ([7f02de2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f02de23c3cedd6198bfd838e6b63002c3341bd8))
* use Koa router name as span name if available ([#976](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/976)) ([fa4fe9c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fa4fe9c9137e198aef897a2c4e01c932c62faabf))
* use Otel SDK 1.2/0.28 ([#984](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/984)) ([098c2ed](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/098c2ed6f9c5ab7bd865685018c0777245aab3b7))
* **user-interaction:** support for custom events and span enhancement ([#653](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/653)) ([27e37e3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/27e37e38f983eabdae4f2cfe859d156440378e08))


### Bug Fixes

* .cjs extension support for lambda functions ([#1442](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1442)) ([da737f1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/da737f1c1eda59d7e340c4026a212d21abcb72d6))
* **@types/koa:** update @types/koa version to latest ([#1447](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1447)) ([5f180aa](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f180aa05d3140010642287de933c708e915b619))
* actually use valid json ([f52ca43](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f52ca4323e1a95b8b2d0a046161dbf5a52665107))
* Add applying patch debug log to pino module ([#1225](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1225)) ([a2719c5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a2719c5fe4422b2264ad82c6c28bdd00dc06f4a4))
* additional config to skip github releases for base repo ([b59208d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b59208dcf26b554c4dfc531491dd1f6a0235803c))
* address webpack memory issue for browser tests ([#1264](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1264)) ([c7f08fe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c7f08fed51bca68b0c522769c3c589102b98ec93))
* allow hapi plugin from array to be registered as argument ([#1253](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1253)) ([1db3b7e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1db3b7e7aa15fc0759264535752b771abff81feb))
* allow mysql streamable query with values array ([#790](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/790)) ([88db0a4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/88db0a4ea134593ba5bf2c7209f94eae466519bd))
* **amqplib:** add missing rabbit service to CI daily run ([#946](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/946)) ([5f63606](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f63606ee983b598d2ad8260e2fb2399cda29a7b))
* **amqplib:** stop importing from `amqplib` directly in compiled types ([#1394](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1394)) ([9d0198c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9d0198ca104a34726a7b41dd910df275e0c5336d))
* **amqplib:** use extracted context for message consuming ([#1354](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1354)) ([ad92673](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ad92673bd6dbf154b8c73968f34d1e836099dd35))
* attempt to auto-update lock file by adding root repo to release config ([538a840](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/538a8408d1b50f92a46fe2d58b34032611d25dc5))
* **auto-instrumentations-node:** add more instrumentations ([#865](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/865)) ([6ba387a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6ba387ab45d0f67fdfac85c43bb0f0f67f2a119b))
* **auto-instrumentations-web:** Add zone.js as a peerDependency ([#1768](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1768)) ([5564096](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5564096eb6227a134c701fde837dff07a5e27d38))
* avoid leaking winston types ([#932](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/932)) ([31c4886](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/31c4886e168c24496a2c60721eb0d9e3b8732d27))
* avoid type imports of the aws-sdk package in the built assets ([#1066](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1066)) ([457be50](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/457be5035b9ba87211fe3553c901b7408dd2d593))
* avoid type imports of the instrumented package in the built assets ([#1017](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1017)) ([e265723](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e2657232c9007a77ddc873a93e8247f99087b9c1))
* **aws-sdk-instrumentation:** Patch new smithy client and middleware packages ([#1626](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1626)) ([3f2bfe8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3f2bfe8ed6feada3f1acc23677862501e8c06304))
* **aws-sdk:** avoid repeating MessageAttributeNames in sqs receiveMessage ([#1044](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1044)) ([4b4ded6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4b4ded6e5b781b9a9cb2c55102ec0949da062511))
* **aws-sdk:** bump aws-sdk instrumentation version to align with previous release ([#1247](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1247)) ([fd2480a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fd2480a4ea7b4093da523ecbc30743a55f38ab6c))
* **aws-sdk:** calc propagation fields count before context inject ([#738](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/738)) ([033cc1f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/033cc1f7ed09c33e401b9514ed30d1160cf58899))
* **aws-sdk:** correct setting error in attributes ([#1495](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1495)) ([5f87026](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5f87026433950b40abb50fa819a163087b9a123b))
* **aws-sdk:** set spanKind to CLIENT by default in v3 ([#1177](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1177)) ([d463695](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d463695f5258875f1da0c7b17c20f7df93494d4e))
* **aws-sdk:** sns span name should be with low cardinality ([#841](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/841)) ([7032a33](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7032a33b6eef331ab327ab57b9bd3a1aed361fb2))
* **aws-xray:** align aws xray to use contrib-test-utils v0.34.0 ([#1582](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1582)) ([1195872](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1195872a5c4cc9f38dd50704a55e0c06521b8127))
* **browser-extension-autoinjection:** update eslint-plugin-json5 version to 0.1.4 ([#896](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/896)) ([e47fcaa](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e47fcaa1a04de35b096f373f44abbf87ff4125f2))
* **ci:** use npx to run lerna ([#1546](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1546)) ([4514522](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4514522e57a862b880df9c43b606f2ea21def942))
* **component owner:** add haddasbronfman as component owner of opentelemetry-redis-common ([#1327](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1327)) ([a116303](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a11630333734a284f961cf31276dc5da3247a3af))
* connect's error handling middleware not called properly (opentel… ([#1076](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1076)) ([012eafb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/012eafb2ff4022220a4e26351ad66f1b1d080aec))
* **connect:** fix wrong rpcMetada.route value not handle nested route ([#1555](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1555)) ([704f76f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/704f76f5b84793238bfb9f44ce018f02948738ce))
* **connect:** Skip update HTTP's span name and update RpcMetadata's route instead ([#1534](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1534)) ([8499b16](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8499b16b720db19b8982ad7745fc79b68c6555a3))
* correct OTel core renovate config ([#1265](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1265)) ([ae76570](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ae7657063f8ecacd6ac4a4c3fed00f91efb758c3))
* correct Otel renovate config ([#1270](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1270)) ([3214bf2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3214bf25f4426c75403be298f6ac65b4bbb086da))
* correctly disable Express instrumentation ([#972](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/972)) ([b55b79b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b55b79b72451c65080e01c2ec11655cabd5f65d9))
* **deps:** update all patch versions ([#1687](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1687)) ([47301c0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/47301c038e4dc7d24797cb0b8426033ecc0374e6))
* **deps:** update dependency @koa/router to v12 ([#1483](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1483)) ([b5b951e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b5b951e5d943d9ef9df7ae3acefe8ea40b8e514f))
* **deps:** update dependency gcp-metadata to v5 ([#1009](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1009)) ([d0a10eb](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d0a10ebefbe3954e3a9b34e26e391eb73b53fb20))
* **deps:** update dependency gcp-metadata to v6 ([#1720](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1720)) ([267dfad](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/267dfad8d11925877e1ff312d4efc551b4360803))
* **deps:** update dependency redis to v3 [security] ([#1423](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1423)) ([31664ca](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/31664cac53f5a8c2ba57919cea594603021fdc9b))
* **deps:** update otel core experimental to ^0.35.1 ([#1358](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1358)) ([ff109b7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff109b77928cc9a139a21c63d6b54399bb017fa4))
* **deps:** update otel core experimental to ^0.38.0 ([#1468](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1468)) ([565a2b2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/565a2b2c6fde88af3f5401ef6a5a9643d0d66349))
* **deps:** update otel core experimental to ^0.39.1 ([#1493](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1493)) ([8ef95bc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8ef95bccc2d03302089f256f3d0ee091869b4c44))
* **deps:** update otel core experimental to ^0.40.0 ([#1527](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1527)) ([4e18a46](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4e18a46396eb2f06e86790dbbd68075c4c2dc83b))
* **deps:** update otel core experimental to ^0.41.0 ([#1566](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1566)) ([84a2377](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/84a2377845c313f0ca68b4de7f3e7a464be68885))
* **deps:** update otel core experimental to v0.41.2 ([#1628](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1628)) ([4f11245](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4f1124524aee565c3cfbf3975aa5d3d039377621))
* **deps:** update otel core experimental to v0.43.0 ([#1676](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1676)) ([deb9aa4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/deb9aa441dc7d2b0fd5ec11b41c934a1e93134fd))
* **deps:** update otel core experimental to v0.44.0 ([#1725](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1725)) ([540a0d1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/540a0d1ff5641522abba560d59a298084f786630))
* **deps:** update otel core experimental to v0.45.0 ([#1779](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1779)) ([7348635](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/734863562c25cd0497aa3f51eccb2bf8bbd5e711))
* **deps:** update otel core experimental to v0.45.1 ([#1781](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1781)) ([7f420e2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7f420e25a8d396c83fd38101088434210705e365))
* **dns:** remove lookupPromise polyfill for node8 dns promise tests  ([#1223](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1223)) ([2777a79](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2777a793239018b968519f27d2d188e41a05afa9))
* **document-load:** compatibility issue with @opentelemetry/sdk-trace-web@1.15.0 ([#1565](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1565)) ([774d254](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/774d25463bdbf7f290d99a07f627237888137e24))
* **documentation:** mixed up winston readme for hook ([#910](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/910)) ([0a557e8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0a557e86c0d70dc6ab7af9736b1746f89c5fc8bf))
* don't try to shut cassandra client down if it wasn't initialized ([#966](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/966)) ([80e855a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/80e855aa39ed10ee42cd3c839dc16a5d0449561a))
* **eslint-config:** replace gts with prettier and eslint ([#1439](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1439)) ([2571c37](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2571c371be1b5738442200cab2415b6a04c32aab))
* **eslint-eqeqeq:** updated the `eqeqeq` rule to match the core repo ([#1485](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1485)) ([5709008](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5709008dfa4d05cae0c2226b9926e36cdf60c631))
* **eslint-no-floating-promises:** added no-floating-promises rule ([#1488](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1488)) ([4eb405e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4eb405ee4875b17f8368d9a88d68c10f24d9987e))
* **example:** fix koa example ([#1088](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1088)) ([d358c1c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d358c1c208b3f4ddea78ba6b721a1d0c1a557342))
* **examples:** fix React Load plugin example ([#800](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/800)) ([fff013c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fff013c26e00d6d88fe80854104f44611c1614b3))
* Export All Azure Resource Detectors ([#1800](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1800)) ([7370386](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7370386f2ea0d156434a127aac4e90af67b9457b))
* **express:** make rpcMetadata.route capture the last layer even when if the last layer is not REQUEST_HANDLER ([#1620](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1620)) ([eeda32a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/eeda32a03a4d75166013188bd0a295a17b2da1dc))
* **express:** use the same clock for span start and end ([#1210](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1210)) ([cbeef6e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cbeef6eef7c4ec8801389fdf9787722b89056537))
* fastify and browser autoinjection failed to compile ([#793](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/793)) ([c08efa8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c08efa82a38d3d5b4d0c51d712a39052317b9f74))
* **fastify:** Make sure consturctor patching works with esm ([#1624](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1624)) ([67f66d2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/67f66d2e0e8ea9f5d9b46819d4f736fa1e0666b6))
* **fastify:** readme option table format ([#1619](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1619)) ([3d6c7be](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3d6c7beffd7c1cc0ef99c7560bc21e01db28b431))
* **fastify:** Use plugin name for middleware span name ([#1680](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1680)) ([4503d3e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4503d3efe98c0b440582101df69a6df49a6cdb97))
* fix CI by forcing colors@1.4.0 ([#825](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/825)) ([0ec9f08](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0ec9f080520fe0f146a915a656300ef53a151ace))
* fix context loss when cursor are accesed concurrently ([#1721](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1721)) ([1dc2e81](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1dc2e815edf81bd0b691639fcb5ba36766e1ec3f))
* fix typescript compilation issue with koa types ([a53f643](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a53f6438d616a6e07b35ff98d063e520adfda5d0))
* **generic-pool:** remove deps on types package for ts5 compatibility ([#1637](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1637)) ([651b4f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/651b4f8bdc18110aeafa22faa1fe2e0a49dbff91))
* **gql:** conform GraphQL span name to spec ([#1444](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1444)) ([7d070db](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7d070db276dffd82faa906e8e4a8ed8dcb790c6d))
* **graphql:** fix `graphql.operation.name` field ([#903](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/903)) ([5529261](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/552926146c838efd7e2b778ae6fb815e9e304965))
* **graphql:** graphql instrumentation throw for sync calls ([#1254](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1254)) ([524d98e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/524d98e4fac3322b7da3cc865f53043f03f67bb7))
* **graphql:** move graphql to dependencies ([#850](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/850)) ([18e4f93](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/18e4f93007b19ecb33f8711ae0d20c51a90887d5))
* handle string ports for Socket.connect ([#1172](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1172)) ([aa6a0dd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aa6a0ddee67730b41630a56d94545ce91c586b14))
* **hapi:** ensure route wrapper starts a new context ([#1094](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1094)) ([4d62c92](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4d62c9289f41424106ebc64a4d51da686cb990b8))
* host-metrics `system.cpu.utilization` calculation fix ([#1741](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1741)) ([b9350d9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b9350d918bf08569cffb3374d2b1e1fff6b38b80))
* **host-metrics:** fallback to process.memoryUsage() ([#1471](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1471)) ([4d11d61](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/4d11d61b709cf12d7d02d31960cd7ccb67404b14))
* **init-logger:** init logger for react-load example ([#764](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/764)) ([3d7a4d6](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3d7a4d61bcc22327518093ea95b35d24e7a44bef))
* **instrumentation-amqplib:** move `@types/amqplib` into dev deps ([#1320](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1320)) ([52136d8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/52136d85064b0d451b3cc67530ee96f8bb8128af))
* **instrumentation-aws-sdk:** sqs message id missing on send command ([#968](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/968)) ([8b36fe1](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8b36fe16abca0a6326d48e5a22fd9302f2936609))
* **instrumentation-dns:** fix instrumentation of `dns/promises` ([#1377](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1377)) ([6d08157](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6d08157300faf418e886315384e6b705a0e13683))
* **instrumentation-dns:** use caret range for semver regular dependency ([#1654](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1654)) ([d9cd8d7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d9cd8d7efcea66e70dab3de8f847f05a7fc9943f))
* **instrumentation-fastify:** add tav script ([#1710](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1710)) ([52dd42d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/52dd42d4748f6aef43988e62f464d95b808a06a6))
* **instrumentation-fastify:** do not wrap preClose and onRequestAbort hooks ([#1764](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1764)) ([de6156a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/de6156aea1db7a7a018ad34f08cfc9f7ff7752b8))
* **instrumentation-fastify:** fix fastify typescript compilation issue ([#1556](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1556)) ([784a422](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/784a4225182037b4233aefb43c7a104eab1ac818))
* **instrumentation-fastify:** stop using fastify types in public api ([#1267](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1267)) ([40515c3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/40515c3dca81d1c177d71af2663fce3b8813bbf2))
* **instrumentation-fs:** allow realpath.native and realpathSync.native ([#1332](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1332)) ([ee0a59a](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ee0a59a59e94743b9411e10c09720a82c6586eb4))
* **instrumentation-fs:** fix `fs.exists` when it's util.promisified ([#1222](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1222)) ([180b336](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/180b336ab482f7656e51e5949b26f36d9ce70ed5))
* **instrumentation-fs:** fix instrumentation of `fs/promises` ([#1375](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1375)) ([3ca874e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3ca874e45ebf4623e76cbe9305e55e820b6e03fd))
* **instrumentation-graphql:** stop using types from `graphql` library in public api ([#1268](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1268)) ([f8cabf3](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f8cabf306faa3e3eb4b9ce38ccdde842abdb2b82))
* **instrumentation-koa:** handle koa routes being of type RegExp ([#1754](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1754)) ([e313938](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e3139386d87dec70bc5f3f689ffe2271dba58942))
* **instrumentation-mysql2:** sql-common should be a dependency ([#1584](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1584)) ([00f7404](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/00f7404156350ef2dfe3b79e525265dbef359dac))
* **instrumentation-net:** make tls span parent of net span ([#1342](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1342)) ([1ee197e](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1ee197ed74e44054b092d0adcdac7f9db1a42737))
* **instrumentation-redis-4:** avoid shimmer warning by only wrapping multi/MULTI if they exist ([#1729](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1729)) ([247a81c](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/247a81c047264ba638abb9a2ef2ca14801094040))
* **instrumentation-redis-4:** fix unhandledRejection in client.multi(...) handling ([#1730](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1730)) ([d953531](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d95353179279e3cf35ec37b6ca18f1e920691e16))
* **instrumentation-redis:** remove redis types from public API ([#1424](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1424)) ([861b867](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/861b867f5ff7e9b0891650f004462b88e2c707de))
* **instrumentation-user-interaction:** addEventListener throws when calling with useCapture = null ([#1045](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1045)) ([893a9fc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/893a9fc2410d45eed68db06c9d3705f43edb75dd))
* **instrumentation/aws-lambda:** Ensure callback is only called once ([#1384](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1384)) ([d822f75](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d822f75e10d6d0421fe8fbd4b1dca261de736e69))
* **ioredis:** fix instrumentation of ESM-imported ioredis ([#1694](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1694)) ([7b457cd](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/7b457cdbcf322a31bbf9dba1412ba49b2da587eb))
* **ioredis:** net.peer.ip -&gt; db.connection_string ([986c349](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/986c3499b324ebdf49aabf35bc3711c91bb91ec8))
* **ioredis:** requireParentSpan not applied to connect spans ([#1151](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1151)) ([d3cb60d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3cb60d28e186b42f0c17ab48df8757555bbe6e0))
* **knex:** nested queries result in wrong span names ([#1537](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1537)) ([f4df836](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4df836a279bd7512ecfeacc25db162e613a0e7e))
* **koa:** ignore generator-based Koa middleware ([#1119](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1119)) ([6684b56](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6684b56b8043f094b95fc3c1ce5e5599e694bad4))
* **memcached:** low cardinality span name ([#1104](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1104)) ([cff4e77](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cff4e775354e162d1f703590bee9483858b3c4b8))
* mongodb types fails to compile with latest tsc v4.8 ([#1141](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1141)) ([ec9ee13](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ec9ee131635dc2db88deea4f2efb887ff6f60577))
* mongodb unwrapping ([#1089](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1089)) ([1db1fec](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1db1fecc16ecb3dbad530de530418260e54c087a))
* **mongodb:** remove broken type export `V4Connection` ([#1644](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1644)) ([ff29576](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ff29576ce9eaeed3681a9bcbd2f84668c396e5fd)), closes [#1639](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1639)
* **mongodb:** use net.peer namespace for mongo host and port ([#1257](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1257)) ([c63d2a4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c63d2a4206b8d4ba0fb337b253ff6c84f0814a09))
* move @opentelemetry/core to dependencies ([#1003](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1003)) ([c7b586f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c7b586f3433e7cf9652a904a9f3d513601d39aca))
* **mysql*,redis:** net.peer.ip -&gt; db.connection_string ([bf39b90](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bf39b908fd64cec92c862b2deca5d760ddcf4509))
* **mysql2-tav:** add 'pretest' command to tav.yml for mysql2 version 3 ([#1490](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1490)) ([1f6299d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/1f6299d9d48ef2f7b206170827d3858e947474db))
* **mysql:** add enhancedDatabaseReporting to mysql ([#1337](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1337)) ([04d583b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/04d583bc879c275d521ed5cbee84a3b79e1292eb))
* **mysql:** add haddasbronfman as componnent owner of mysql ([#1361](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1361)) ([aae03f2](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/aae03f2ae889ddbd449014e536ddc6d656dd5c2b))
* **mysql:** metrics - align metrics description and unit to semconv ([#1480](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1480)) ([9fbd9e8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/9fbd9e81b2ecb5dd06436cad41a9786d657c0ff8))
* **mysql:** set proper context for outgoing queries ([#1140](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1140)) ([59f7bce](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/59f7bce383a754bd5f08ae4e5a75e27de6d3d6e2))
* **nestjs:** remove nestjs type from exported Instrumentation ([#992](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/992)) ([eba9531](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/eba9531477233a1cbe9d5bdeff40ee6274adb452))
* **nestjs:** update dependency @nestjs/x to v9 ([#1538](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1538)) ([fec1799](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/fec17997d64349f00c1141ada9ae4bcbde3e5e89))
* **opentelemetry-instrumentation-aws-sdk:** error when ReturnConsumedCapacity is set to None ([#899](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/899)) ([e7ab4d0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e7ab4d056b6663f593b47af7c3e8014a72a963fe))
* **opentelemetry-instrumentation-nestjs-core:** copy metadata to wrapped handler ([#796](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/796)) ([2c4a834](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2c4a83421c979f65fd464d9599882de9a65bbc74))
* **opentelemetry-instrumentation-redis:** add condition before error print ([#897](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/897)) ([f1d2fd0](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f1d2fd084c8e3e494e3606c4eca53158495f43f6))
* **opentelemetry-resource-detector-aws:** add missing attribute to la… ([#810](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/810)) ([359fee8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/359fee89b708ce7995ee5a282c753e56c411e87c))
* pg span names ([#1306](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1306)) ([8a375f5](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/8a375f59f3043a7d3749b1e8af5603b9ed30f08f))
* **pg-values:** values should be parsable when enhancedDatabaseRepoting:true ([#1453](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1453)) ([49a0389](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/49a03892c05dbeda98badeb07847240869442384))
* **pg:** avoid disjoint spans from pg instrumentation ([#1122](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1122)) ([82b8a84](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/82b8a8490628282efba334cb19f43bb6bf796548))
* **pg:** do not replace argument with plain object ([#1432](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1432)) ([e691537](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e6915373aaa8c1226f6dc122b49ae6bfb2fc1ddd))
* **pg:** fix instrumentation of ESM-imported pg ([#1701](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1701)) ([2502e18](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2502e18e03ed8796679349a534100d743dc639e6))
* **pg:** update requireParentSpan to skip instrumentation when parent not present ([#1343](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1343)) ([d23c329](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d23c329a1581709ddc0f336fddfa1aa930f90c3f))
* **pino:** removed the tav for versions ^8 ([#1146](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1146)) ([078ab2d](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/078ab2d3869452e48d9c6cd7d47ba8f66f2fb370))
* **postgres:** pass 'arguments' to the connect callback ([#1395](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1395)) ([b02775f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/b02775f0d9e84dea5463bb9a3883d0ad6ff1f500))
* **preact-example:** update example to use latest otelcol/js-core ([#1458](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1458)) ([61dd957](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/61dd9570268482e4a9dff1a27c7d30e6515a52b9))
* **propagator-ot-trace:** read sampled flag correctly from span context ([#1077](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1077)) ([69740ab](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/69740aba848486908e924376e3ca093ab88720b6))
* readme snippet ([#1182](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1182)) ([35d1e45](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/35d1e4579f7b160c501959f6fb45859b75cdde99))
* **readme:** Correct urls to npm ([#1144](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1144)) ([d8767a9](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d8767a9032dd7fb78b7fdd82f50c1f76e939d33e))
* reconfigure stalebot to not close bugs ([#1709](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1709)) ([2d36152](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/2d36152d66adc4e2436994becb3247ec8c4d3b92))
* redis instrumentation startup stream check [#666](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/666) ([#818](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/818)) ([81b3190](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/81b3190af64bda14f87c5b0cbd6172bafda26408))
* **redis-4:** add support to new version of redis ([#1324](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1324)) ([378f130](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/378f130befb2bd8be42d367b9db5ae9329d57b5e))
* **redis-4:** omit credentials from db.connection_string span attribute ([#1562](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1562)) ([ccf1efe](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/ccf1efe0cf8f144ab0d0aab490dfff499bd3158e))
* **redis:** serialize non sensitive arguments into db.statement attribute ([#1299](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1299)) ([092a250](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/092a2509bcf884e1b997e0eaec3a6ca02cfd2058))
* remove component attribute from instrumentations ([#1399](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1399)) ([e93a192](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e93a192b672c8db361bac83ad60294ca49b95361))
* remove extra parameters for '.' ([3bea3a4](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3bea3a42527c07530cc9ac9a055aae1e1ad3a41d))
* remove forcing RUN_MSSQL_TESTS to be true in tests ([#965](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/965)) ([bcbdeb7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/bcbdeb7231e2ad208421c8c61085cec881dc0867))
* remove link to browser extension to external repo. ([#979](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/979)) ([c5b9356](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/c5b9356d4eb925df64b66c859d1d8367ae57d437))
* remove types of the instrumented libs form public apis ([#1221](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1221)) ([682d610](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/682d6107b7285829bb72e592936c585ccdfab16a))
* remove unneeded type exports in mongodb instrumentation ([#1194](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1194)) ([6920a55](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/6920a554b46bf8af5e00b60073d479feacb18dcd))
* Removed deprecated properties usage in Fastify instrumentation ([#1679](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1679)) ([d3328f8](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/d3328f8f55c6e3e2e7405a8e499d50555e9bec1a))
* rename lerna's --include-filtered-dependencies option ([#817](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/817)) ([cf268e7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/cf268e7a92b7800ad6dbec9ca77466f9ee03ee1a))
* **renovate:** change renovate patch schedule ([#1603](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1603)) ([e242645](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e242645269940c97f6418d1375a3dab07c032a93))
* Revert "feat(minification): Add importHelpers and tslib as a dependency ([#1545](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1545))" ([#1611](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1611)) ([e5bca5f](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e5bca5fe5b27adc59c8de8fe4087d38b69d93bd4))
* separate public and internal types for all instrumentations ([#1251](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1251)) ([e72ea58](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/e72ea58cfb888a90590970f63d3a042a8ea3aaf2))
* skip mongodb TAV runs on node 8 and 10 ([#949](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/949)) ([00b1a94](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/00b1a9472ed21f6dfe427543a407e559b1cfe08a))
* **sns-publish-test-v3:** add test for sns.publish for aws sdk v3 ([#1015](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1015)) ([0293d89](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/0293d897f789bdeb7b843f673be2c2dc62e16010))
* typo in fastify description ([#891](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/891)) ([adbd6dc](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/adbd6dcb0af6540a6d10b7e2ceaaf2c69a3e1146))
* Update defect of of wrong resource attribute of "container.id" ([#1682](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1682)) ([5675c49](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5675c49b2b58e6b159a47d1a9ff5b00bc30a94a0))
* update eslint-plugin-import to resolve conflicts ([#864](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/864)) ([45efaee](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/45efaeec1da51398e44857dc9fe7ab3ef9456983))
* update some dev-deps in fastify instrumentation ([a20f77b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/a20f77b539d2a1eecc8a423d3b0381988e4734b8))
* use context API to bind connection checkOut callback ([#1766](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1766)) ([229b1f7](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/229b1f78e847000cb3c24692423bd505dc994ddf))
* use localhost for services in CI ([#816](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/816)) ([f497313](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/f4973133e86549bbca301983085cc67788a10acd))
* use SQL verb for mysql2 span name when query object is used ([#923](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/923)) ([3d1388b](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/3d1388b0f779417de86b5b9af84d9000c7f67782))
* **vinyl-fs:** removed unnecessary dep types/vinyl-fs ([#1390](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1390)) ([5a8df08](https://github.com/open-telemetry/opentelemetry-js-contrib/commit/5a8df0826b24c37ae5b992d5f68286f9742ce79f))

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
