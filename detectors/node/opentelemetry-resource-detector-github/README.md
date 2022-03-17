# OpenTelemetry Resource Detector for GitHub Actions

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

Resource detector for GitHub Actions.

Detects `GITHUB_*` environment variables [specified here](https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables) and adds as attributes on a resource.

This is useful for collecting telemetry in GitHub Actions-powered CI/CD workflows.

The OpenTelemetry Resource is an immutable representation of the entity producing telemetry. For example, a process producing telemetry that is running in a container on Kubernetes has a Pod name, it is in a namespace and possibly is part of a Deployment which also has a name. All three of these attributes can be included in the `Resource`.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/resource-detector-github
```

## Usage

```js

const { gitHubDetector } = require('@opentelemetry/opentelemetry-resource-detector-github')

async function run() {
  // Initialize GitHub Resource Detector
  const resource = await gitHubDetector.detect();
};

run()
```

## Useful links

- [GitHub Action Enviornment Variables](https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables)
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-github
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-github.svg
