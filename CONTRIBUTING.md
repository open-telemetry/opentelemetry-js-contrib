# Contributing Guide

We'd love your help!

- [Development Quick Start](#development-quick-start)
- [Report a bug or requesting feature](#report-a-bug-or-requesting-feature)
- [How to contribute](#how-to-contribute)
  - [Before you start](#before-you-start)
    - [Conventional commit](#conventional-commit)
  - [Fork](#fork)
- [Development](#development)
  - [Tools used](#tools-used)
  - [General guidance](#general-guidance)
  - [CHANGELOG](#changelog)
  - [Benchmarks](#benchmarks)
- [Component Ownership](#component-ownership)
- [Component Lifecycle](#component-lifecycle)
  - [Unreleased](#unreleased)
  - [Experimental](#experimental)
  - [Beta](#beta)
  - [Stable](#stable)
  - [Unmaintained](#unmaintained)
  - [Deprecated](#deprecated)
- [Pull Request Merge Guidelines](#pull-request-merge-guidelines)
  - [General Merge Requirements](#general-merge-requirements)
- [Contributing Vendor Components](#contributing-vendor-components)
  - [Adding a New Vendor Component](#adding-a-new-vendor-component)
  - [Removing Vendor Components](#removing-vendor-components)

## Development Quick Start

To get the project started quickly, you can follow these steps. For more
detailed instructions, see [development](#development) below.

```sh
git clone https://github.com/open-telemetry/opentelemetry-js-contrib.git
cd opentelemetry-js-contrib
npm ci
npm run compile
npm test
```

## Report a bug or requesting feature

Reporting bugs is an important contribution. Please make sure to include:

- expected and actual behavior.
- Node version that application is running.
- OpenTelemetry version that application is using.
- if possible - repro application and steps to reproduce.

## How to contribute

### Before you start

Please read project contribution
[guide](https://github.com/open-telemetry/community/blob/main/CONTRIBUTING.md)
for general practices for OpenTelemetry project.

#### Conventional commit

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history; which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages. You can see examples [here](https://www.conventionalcommits.org/en/v1.0.0/#examples).

We use [the "pr-title" CI workflow](./.github/workflows/pr-title.yml) to ensure PR titles, and hence the commit message from those PRs, follow the Conventional Commits spec.

### Fork

In the interest of keeping this repository clean and manageable, you should work from a fork. To create a fork, click the 'Fork' button at the top of the repository, then clone the fork locally using `git clone git@github.com:USERNAME/opentelemetry-js-contrib.git`.

You should also add this repository as an "upstream" repo to your local copy, in order to keep it up to date. You can add this as a remote like so:

```bash
git remote add upstream https://github.com/open-telemetry/opentelemetry-js-contrib.git

#verify that the upstream exists
git remote -v
```

To update your fork, fetch the upstream repo's branches and commits, then merge your main with upstream's main:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

Remember to always work in a branch of your local copy, as you might otherwise have to contend with conflicts in main.

Please also see [GitHub workflow](https://github.com/open-telemetry/community/blob/main/CONTRIBUTING.md#github-workflow) section of general project contributing guide.

## Development

### Tools used

- [NPM](https://npmjs.com)
- [TypeScript](https://www.typescriptlang.org/)
- [lerna](https://github.com/lerna/lerna) to manage dependencies, compilations, and links between packages. Most lerna commands should be run by calling the provided npm scripts.
- [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [MochaJS](https://mochajs.org/) for tests
- [eslint](https://eslint.org/)

Refer to the core repository for [supported runtimes](https://github.com/open-telemetry/opentelemetry-js#supported-runtimes).
Refer to the root-level [package.json](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/package.json) for shared dev dependency versions, and the package-level package.json for package-specific versions if different or not included in the shared root.

### General guidance

The `opentelemetry-js-contrib` project is written in TypeScript.

As a general rule, installing and then compiling from the root directory should always be done first before anything else.
After making changes to a specific package, compile again from the specific package directory you are working in.
Some tests depend on other packages to be installed, so these steps are also required for running tests.

- `npm ci` installs dependencies ([see npm-ci docs](https://docs.npmjs.com/cli/v10/commands/npm-ci))
- `npm run compile` compiles the code, checking for type errors.
- `npm test` runs most unit tests, though some packages require other dependencies so are only run in CI or with a separate command in the package's `package.json` file.
- `npm run lint:fix` lint any changes and fix if needed.

Each of these commands can also be run in individual packages, as long as the initial install and compile are done first in the root directory.

### CHANGELOG

The conventional commit type (in PR title) is very important to automatically bump versions on release. For instance:

- any type + `!` will bump major version (or minor on pre-release)
- `feat` will bump minor
- `fix` will bump patch

There is no need to update the CHANGELOG in a PR because it will be updated as part of the release process (see [RELEASING.md](RELEASING.md) for more details).

### Testing

Most unit tests case be run via:

```sh
npm test
```

However, some instrumentations require test-services to be running (e.g. the `instrumentation-mongodb` package requires a MongoDB server). Use the `test-services`-related npm scripts to start test services in Docker and then run the tests with the appropriate configuration to use those services:

```sh
npm run test-services:start     # starts services in Docker
npm run test:with-test-services # runs 'npm test' with envvars from test/test-services.env
npm run test-services:stop      # stops Docker containers
```

This set of commands works in the top-level directory to test all packages, or
in a specific package directory that requires a test service (e.g. `plugins/node/opentelemetry-instrumentation-mongodb`).

### Benchmarks

When two or more approaches must be compared, please write a benchmark in the benchmark/index.js module so that we can keep track of the most efficient algorithm.

- `npm run bench` to run your benchmark.

## Component Ownership

This repository contains many components which are maintained by more than the typical set of JS maintainers and approvers.
Each component in this repository SHOULD have a component owner who is responsible for maintaining it.
The README.md for each component SHOULD contain its owner, but the source of truth for component ownership is in [.github/component_owners.yml](.github/component_owners.yml).
Component owners are generally given authority to make decisions relating to implementation and feature requests for their components, provided they follow the best practices set out by the maintainers.
Component owners MUST do their best to maintain a high level of quality, security, performance, and specification compliance within their components.
Maintainers may override the decisions of component owners, but should only do so when they feel one or more of these traits is compromised.

## Component Lifecycle

This repository contains many components in various stages of the component lifecycle.
A component may be **unreleased**, **experimental**, **beta**, **stable**, **unmaintained**, or **deprecated**; see the below definitions for each stability level.
With the exception of the stable status, it is up to each individual [component owner](#component-ownership) to determine the status of a component.
A component may only be marked stable with the approval of a member of @open-telemetry/javascript-maintainers; see the definition of stable below for more details.

A Pull Request modifying components in any stage of the lifecycle is subject to the
[Pull Request Merge Requirements](#pull-request-merge-requirements).

### Unreleased

Unreleased components are in active development and have not yet been released to NPM.
Unreleased packages should have the property `private` in their `package.json` set to `true`.

### Experimental

Experimental packages are in active development.
They should be considered unstable and potentially unsuitable for production use.
They are released to NPM for developers and early adopters.
Experimental components MUST have their major version set to `0`.
If a component does not have an explicit status in its README.md file, it should be considered to be experimental.

### Beta

Beta packages are not yet considered stable, but an effort should be made to preserve stability across versions if possible.
They may be ready for production use, but users should understand that their APIs or the telemetry they output MAY change if required.
Beta components MUST have their major version set to `0`.

### Stable

This is the highest level of quality and maintainership guarantee provided in this repository.
Stable packages should be considered stable and ready for production use.
In order for a package to be marked stable, it must meet the following requirements:

- It MUST have a component owner that the JS maintainers feel confident will be responsive to issues and pull requests and will fulfill their responsibility competently.
  If a component owner is not responsive to issues and PRs, the maintainers may assign a new owner or change the status of the component to unmaintained.
- All relevant specification relating to the component MUST be stable. For example, telemetry emitted by an instrumentation library should rely on a stable semantic convention.
- It MUST be reviewed and approved by a member of @open-telemetry/javascript-maintainers.

Stable components MUST have their major version set to `1` or greater.

### Unmaintained

A component which does not have an assigned component owner, or has a component owner who has been unresponsive to issues and pull requests may be marked as unmaintained.
Unmaintained components may continue to work and receive updates and fixes from contributors, but may not receive immediate attention if there is a problem or feature request.
A component which is unmaintained may be deprecated if there is a problem that is not fixed in a timely manner.

### Deprecated

Deprecated components are no longer maintained and there are not currently plans to maintain them.
They may not work and there are no guarantees for fixes or new features.
Their source files may be deleted from the repository.
Any packages released from their source will be marked as deprecated in NPM.

## Pull Request Merge Guidelines

Pull requests MAY be merged by an approver OR a maintainer provided they meet all the following [General Merge Requirements](#general-merge-requirements).
All requirements are at the discretion of the maintainers.
Maintainers MAY merge pull requests which have not strictly met these requirements.
Maintainers MAY close, block, or put on hold pull requests even if they have strictly met these requirements.

It is generally expected that a maintainer ([@open-telemetry/javascript-maintainers](https://github.com/orgs/open-telemetry/teams/javascript-maintainers)) should review and merge major changes.
Some examples include, but are not limited to:

- Breaking changes
- New modules
- Changes which affect runtime support

If a PR has not been interacted with by a reviewer within one week, please ping the component
owners as listed in [.github/component_owners.yml](.github/component_owners.yml), if component owners are unresponsive
please ping ([@open-telemetry/javascript-approvers](https://github.com/orgs/open-telemetry/teams/javascript-approvers)).

### General Merge Requirements

- Approved by
  - at least one component owner if one is defined in [.github/component_owners.yml](.github/component_owners.yml)
  - OR one maintainer
  - OR at least one approver who is not the approver merging the pull request
    - A pull request for small (simple typo, URL, update docs, or grammatical fix) changes may be approved and merged by the same approver
- No “changes requested” reviews or unresolved conversations by
  - approvers
  - maintainers
  - technical committee members
  - component owners
  - subject-matter experts
- New or changed functionality is tested by unit tests
- New or changed functionality is documented if appropriate
- Substantial changes should not be merged within 24 hours of opening in order to allow reviewers from all time zones to have a chance to review

## Contributing Vendor Components

This repo is generally meant for hosting components that work with popular open-source frameworks and tools. However, it is also possible to contribute components specific to a 3rd party vendor in this repo.

### Adding a New Vendor Component

Vendor components that are hosted in this repo will be versioned the same as all other contrib components, and released in lockstep with them under the `@opentelemetry` org in npm.

In exchange, vendor component contributors are expected to:

- Include documentation for the component that covers:
  - The installation and getting started process for the component
  - Any configuration for the component
  - Any APIs exposed by the component
  - Design information for the component if relevant
- Add enough unit tests to *at least* meet the current coverage
- Assign at least one full-time engineer to their component in the [CODEOWNERS](.github/CODEOWNERS) file
- Review pull requests that touch their component
- Respond to issues related to their component, as determined by the maintainers
- Fix failing unit tests or any other blockers to the CI/CD workflow
- Update their components' usage of Core APIs upon the introduction of breaking changes upstream

### Removing Vendor Components

All vendor components are subject to removal from the repo at the sole discretion of the maintainers. Reasons for removal include but are not limited to failing to adhere to any of the expectations defined above in a timely manner. "Timely manner" can vary depending on the urgency of the task, for example if a flaky unit test is blocking a release for the entire repo that would be far more urgent than responding to a question about usage. As a rule of thumb, 2-3 business days is a good goal for non-urgent response times.
