/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');

const packageRoot = process.cwd();
const monorepoRoot = path.resolve(__dirname, '..');

const autoInstrumentationNodeDeps =
  require(`${monorepoRoot}/packages/auto-instrumentations-node/package.json`).dependencies;
const autoInstrumentationWebDeps =
  require(`${monorepoRoot}/packages/auto-instrumentations-web/package.json`).dependencies;

// remove exempt instrumentations
delete autoInstrumentationNodeDeps['@opentelemetry/instrumentation-fastify'];

// extract info from package.json
const packageJsonUrl = path.resolve(`${packageRoot}/package.json`);
const pjson = require(packageJsonUrl);
const instrumentationPackageName = pjson.name;

// identify if it's node or web
// eslint-disable-next-line no-unused-vars
const isNode = instrumentationPackageName in autoInstrumentationNodeDeps;
const isWeb = instrumentationPackageName in autoInstrumentationWebDeps;

// extract info from README.md
const currentReadmeContent = fs.readFileSync(
  path.resolve(`${packageRoot}/README.md`),
  'utf8'
);

// make sure the footer is present

const footerToVerify = `## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/${instrumentationPackageName}
[npm-img]: https://badge.fury.io/js/${encodeURIComponent(
  instrumentationPackageName
)}.svg
`;

if (!currentReadmeContent.includes(footerToVerify)) {
  throw new Error(
    `README.md footer is not valid. Please add the following text to the README.md file:\n\n${footerToVerify}`
  );
}

// make sure we have badges at the top

const badgesToVerify = `[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]
`;

if (!currentReadmeContent.includes(badgesToVerify)) {
  throw new Error(
    `README.md badges are not valid. Please add the following text to the README.md file:\n\n${badgesToVerify}`
  );
}

if (isWeb) {
  const distText = `If total installation size is not constrained, it is recommended to use the [\`@opentelemetry/auto-instrumentations-web\`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web) bundle with [\`@opentelemetry/sdk-trace-web\`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK \`1.0+\`.
`;

  if (!currentReadmeContent.includes(distText)) {
    throw new Error(
      `README.md dist text is not valid. Please add the following text to the README.md file:\n\n${distText}`
    );
  }
}
