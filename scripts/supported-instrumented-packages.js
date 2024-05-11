/*!
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

/**
 * This script updates the README of the '@opentelemetry/auto-instrumentations-node' package
 * to include the supported range for each instrumented package.
 *
 * To run this script, execute `node scripts/supported-instrumented-packages.js`
 */

const fs = require('fs');
const path = require('path');

const autoInstrumentationNodePackageRelPath =
  '../metapackages/auto-instrumentations-node';

// read all the instrumentation packages that are supported by the auto-instrumentation-node package package
const {
  getNodeAutoInstrumentations,
} = require(autoInstrumentationNodePackageRelPath);

const instrumentations = getNodeAutoInstrumentations();

const instrumentationsNames = instrumentations.map(instrumentation => {
  const packageName = instrumentation.instrumentationName;
  const packageVersion = instrumentation.instrumentationVersion;
  return {
    packageName,
    packageVersion,
    name: packageName.replace('@opentelemetry/', ''),
  };
});

const getInstrumentationPath = instrumentationName => {
  try {
    const oldFormatPath = 'plugins/node/opentelemetry-' + instrumentationName;
    require('../' + oldFormatPath);
    return {
      instrumentationPath: oldFormatPath,
      repo: 'opentelemetry-js-contrib',
    };
  } catch (e) {
    // ignore
  }
  try {
    const newFormatPath = 'plugins/node/' + instrumentationName;
    require('../' + newFormatPath);
    return {
      instrumentationPath: newFormatPath,
      repo: 'opentelemetry-js-contrib',
    };
  } catch (e) {
    // ignore
  }
  // exception for cassandra driver where the package name is different from the instrumentation name
  if (instrumentationName === 'instrumentation-cassandra-driver') {
    return {
      instrumentationPath:
        'plugins/node/opentelemetry-instrumentation-cassandra',
      repo: 'opentelemetry-js-contrib',
    };
  }
  if (
    instrumentationName === 'instrumentation-http' ||
    instrumentationName === 'instrumentation-grpc'
  ) {
    return {
      instrumentationPath: `experimental/packages/opentelemetry-${instrumentationName}`,
      repo: 'opentelemetry-js',
    };
  }
  return {
    instrumentationPath: undefined,
    repo: undefined,
  };
};

// for each instrumentation, find it's path on the fs to read it's README content
const instrumentationsPaths = instrumentationsNames.map(instrumentation => {
  const { instrumentationPath, repo } = getInstrumentationPath(
    instrumentation.name
  );
  if (!instrumentationPath || !repo) {
    console.error(`Could not find path for ${instrumentation.name}`);
    return instrumentation;
  }
  return {
    ...instrumentation,
    instrumentationPath,
    repo,
  };
});

const getReadmeContent = instrumentationPackage => {
  const { repo } = instrumentationPackage;
  if (repo === 'opentelemetry-js-contrib') {
    try {
      const { instrumentationPath } = instrumentationPackage;
      const markdownPath = path.join(instrumentationPath, 'README.md');
      // the script runs from the root of the repository
      fileContent = fs.readFileSync(markdownPath, 'utf-8');
      return Promise.resolve(fileContent);
    } catch (e) {
      console.error(
        `Could not read README for ${instrumentationPackage.name}`,
        e
      );
      return undefined;
    }
  } else if (repo === 'opentelemetry-js') {
    // use axios to fetch the README content from the github repository
    const axios = require('axios');
    const { instrumentationPath, name, packageVersion } =
      instrumentationPackage;
    const url = `https://raw.githubusercontent.com/open-telemetry/${repo}/experimental/v${packageVersion}/${instrumentationPath}/README.md`;
    return axios
      .get(url)
      .then(response => {
        return response.data.toString();
      })
      .catch(error => {
        console.error(`Could not fetch README for ${name}`);
        return undefined;
      });
  }

  return undefined;
};

const supportedVersions = Promise.all(
  instrumentationsPaths.map(instrumentationPackage => {
    const contentPromise = getReadmeContent(instrumentationPackage).then(
      content => {
        if (!content) {
          return instrumentationPackage;
        }
        const regex = /## Supported Versions([^#]*)/;
        const match = content.match(regex);
        if (match && match[1]) {
          // This contains the content after "## Supported Versions" up to the next "##"
          const supportedVersionsContent = match[1].trim();
          return {
            ...instrumentationPackage,
            supportedVersionsContent,
          };
        } else {
          console.log(
            'Section "## Supported Versions" not found.',
            instrumentationPackage.name
          );
          return instrumentationPackage;
        }
      }
    );
    return contentPromise;
  })
).then(instrumentations => {
  const linkToGithub = instrumentations.map(instrumentation => {
    const { instrumentationPath, packageVersion, name, repo } = instrumentation;
    const githubLink =
      repo === 'opentelemetry-js-contrib'
        ? `https://github.com/open-telemetry/${repo}/tree/${name}-v${packageVersion}/${instrumentationPath}`
        : `https://github.com/open-telemetry/${repo}/tree/experimental/v${packageVersion}/${instrumentationPath}`;
    return {
      ...instrumentation,
      githubLink,
    };
  });

  const mdContent = linkToGithub.map(instrumentation => {
    const { packageName, supportedVersionsContent, githubLink } =
      instrumentation;
    let markdownContent = `- [${packageName}](${githubLink})`;
    if (supportedVersionsContent) {
      // add 2 spaces to the beginning of each line to format it as a list
      markdownContent =
        markdownContent +
        '\n' +
        supportedVersionsContent
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n');
    }
    return markdownContent;
  });

  const autoInstrumentationReadme = fs.readFileSync(
    path.join(`./scripts`, autoInstrumentationNodePackageRelPath, 'README.md'),
    'utf-8'
  );

  // Regular Expression to find the section between "## Supported instrumentations" and the next "##"
  const regex = /## Supported instrumentations.*?(\n##|$)/s;

  // Replace the matched content with the new section
  // We include "## Supported instrumentations" and append the new content, then find the next heading to maintain it.
  const newContent = autoInstrumentationReadme.replace(
    regex,
    `## Supported instrumentations\n${mdContent.join('\n')}\n##`
  );

  console.log(
    'writing back changes to README.md of auto-instrumentations-node package'
  );
  fs.writeFileSync(
    path.join(`./scripts`, autoInstrumentationNodePackageRelPath, 'README.md'),
    newContent
  );
});
