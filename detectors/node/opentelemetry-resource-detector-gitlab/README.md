# OpenTelemetry Resource Detector for GitLab CI

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

Resource detector for GitLab CI.

Detects some of the GitLab CI environment variables [specified here](https://docs.gitlab.com/ci/variables/predefined_variables/) and adds as attributes on a resource.

This is useful for collecting telemetry in GitLab CI-powered CI/CD workflows.

The OpenTelemetry Resource is an immutable representation of the entity producing telemetry. For example, a process producing telemetry that is running in a container on Kubernetes has a Pod name, it is in a namespace and possibly is part of a Deployment which also has a name. All three of these attributes can be included in the `Resource`.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/resource-detector-gitlab
```

## Usage

```js
const { gitLabDetector } = require('@opentelemetry/resource-detector-gitlab')

async function run() {
  // Initialize GitLab Resource Detector
  const resource = await gitLabDetector.detect();
};

run()
```

## Available detectors

### GitLab Detector

| Resource Attribute     | Description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| gitlab.user_email      | Value of Process Environment Variable `GITLAB_USER_EMAIL`                   |
| gitlab.user_id         | Value of Process Environment Variable `GITLAB_USER_ID`                      |
| gitlab.project_path    | Value of Process Environment Variable `CI_PROJECT_PATH`                     |
| gitlab.ref             | Value of Process Environment Variable `CI_COMMIT_REF_NAME`                  |
| gitlab.source          | Value of Process Environment Variable `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME` |
| gitlab.target          | Value of Process Environment Variable `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` |
| gitlab.mr_iid          | Value of Process Environment Variable `CI_MERGE_REQUEST_IID`                |
| gitlab.pipeline_id     | Value of Process Environment Variable `CI_PIPELINE_ID`                      |
| gitlab.pipeline_source | Value of Process Environment Variable `CI_PIPELINE_SOURCE`                  |
| gitlab.commit_sha      | Value of Process Environment Variable `CI_COMMIT_SHA`                       |

## Useful links

- [GitLab CI Environment Variables](https://docs.gitlab.com/ci/variables/predefined_variables/)
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/resource-detector-gitlab
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fresource-detector-gitlab.svg
