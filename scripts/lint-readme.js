const fs = require('fs');
const path = require('path');

const packageRoot = process.cwd();

// extract info from package.json
const packageJsonUrl = path.resolve(`${packageRoot}/package.json`);
const pjson = require(packageJsonUrl);
const instrumentationPackageName = pjson.name;

if (!pjson.opentelemetry) {
  throw new Error(
    `package.json is missing the "opentelemetry" field. Please add it.`
  );
}

// identify if it's node or web
const isNode = 'node' in pjson.opentelemetry.platforms;
const isWeb = 'web' in pjson.opentelemetry.platforms;

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
[npm-img]: https://badge.fury.io/js/${encodeURIComponent(instrumentationPackageName)}.svg
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

if (isNode) {
  const distText = `If total installation size is not constrained, it is recommended to use the [\`@opentelemetry/auto-instrumentations-node\`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](\`https://www.npmjs.com/package/@opentelemetry/sdk-node\`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK \`1.0+\`.
`

  if (!currentReadmeContent.includes(distText)) {
    throw new Error(
      `README.md dist text is not valid. Please add the following text to the README.md file:\n\n${distText}`
    );
  }
} else if (isWeb) {
  const distText = `If total installation size is not constrained, it is recommended to use the [\`@opentelemetry/auto-instrumentations-web\`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web) bundle with [\`@opentelemetry/sdk-trace-web\`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK \`1.0+\`.
`;  

  if (!currentReadmeContent.includes(distText)) {
    throw new Error(
      `README.md dist text is not valid. Please add the following text to the README.md file:\n\n${distText}`
    );
  }
}
