# Contributing Guide

We'd love your help!

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

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history; which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages. You can see examples [here](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#examples).
We use [commitlint](https://github.com/conventional-changelog/commitlint) and [husky](https://github.com/typicode/husky) to prevent bad commit message.
For example, you want to submit the following commit message `git commit -s -am "my bad commit"`.
You will receive the following error :

```text
✖   type must be one of [ci, feat, fix, docs, style, refactor, perf, test, revert, chore] [type-enum]
```

Here an exemple that will pass the verification: `git commit -s -am "chore(opentelemetry-core): update deps"`

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

### Running the tests

The `opentelemetry-js-contrib` project is written in TypeScript.

- `npm install` to install dependencies.
- `npm run compile` compiles the code, checking for type errors.
- `npm test` tests code the same way that our CI will test it.
- `npm run lint:fix` lint (and maybe fix) any changes.

### Generating API documentation

- `npm run docs` to generate API documentation. Generates the documentation in `packages/opentelemetry-api/docs/out`

### Generating CHANGELOG documentation

- `npm run changelog` to generate CHANGELOG documentation in your terminal (see [RELEASING.md](RELEASING.md) for more details).

### Benchmarks

When two or more approaches must be compared, please write a benchmark in the benchmark/index.js module so that we can keep track of the most efficient algorithm.

- `npm run bench` to run your benchmark.

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
