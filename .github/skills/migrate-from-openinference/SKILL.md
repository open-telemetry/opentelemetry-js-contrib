---
name: migrate-from-openinference
description: Migrate a donated JavaScript or TypeScript openinference-instrumentation-* package from https://github.com/open-telemetry/donation-openinference into opentelemetry-js-contrib. Creates a new package or augments an existing package with missing OpenInference coverage while converting it to official OpenTelemetry GenAI semantic conventions. Use when a user asks to migrate or port a donated OpenInference JS instrumentation package.
---

# Migrate a donated OpenInference JavaScript instrumentation package

Migrate an `openinference-instrumentation-<source>` package from
[`open-telemetry/donation-openinference/js/packages`](https://github.com/open-telemetry/donation-openinference/tree/main/js/packages)
into this repository.

The donated instrumentation package is reference material, not the final
implementation. The result must follow OpenTelemetry JavaScript instrumentation
conventions, emit official OpenTelemetry GenAI semantic conventions, and
contain no OpenInference dependencies.

This skill covers two modes:

- **Greenfield migration**: no equivalent package exists in this repository.
  Create a new package under `packages/`.
- **Augment an existing package**: this repository already instruments the
  library. Inventory both implementations and add only the missing operations,
  request or response shapes, tests, and semantic convention coverage. See
  [Augment mode](#augment-mode-the-package-already-exists).

This workflow is adapted from the Python
[`migrate-from-openinference` skill](https://github.com/open-telemetry/opentelemetry-python-genai/tree/main/.github/skills/migrate-from-openinference)
for this repository's TypeScript, npm workspace, instrumentation, and test
conventions.

## Inputs

The user should identify a source instrumentation package, for example:

```text
@arizeai/openinference-instrumentation-anthropic
```

The source directory name must begin with `openinference-instrumentation-`.
Do not use this skill for utility, semantic-model, or middleware packages such
as `openinference-core`, `openinference-genai`, `openinference-vercel`, or
`openinference-tanstack-ai`; those require a separately designed workflow.

Use only the corresponding package in the OpenTelemetry donation repository:

```text
https://github.com/open-telemetry/donation-openinference/tree/main/js/packages/<source>
```

Do not use `Arize-ai/openinference` as the migration source. Record the source
repository commit in the migration report so reviewers can reproduce the
comparison.

Derive the target name by removing `openinference-` and changing the npm scope:

```text
@arizeai/openinference-instrumentation-anthropic
  -> @opentelemetry/instrumentation-anthropic
  -> packages/instrumentation-anthropic
```

Legacy variants such as `openinference-instrumentation-langchain-v0` need an
explicit support decision before implementation.

## Before starting

### 1. Claim the package

Check the assignment table in
[`opentelemetry-js-contrib#3668`](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3668).
Confirm that the tracking issue covers the target as an accepted instrumentation
request. Before writing code, ask to be assigned to an unclaimed package and
identify at least two contributors who agree to serve as code owners, as
required by `CONTRIBUTING.md`. Link the tracking issue from the migration pull
request.

Also confirm that the component belongs in this repository. `CONTRIBUTING.md`
prefers native instrumentation, a repository close to the instrumented
library, or a dedicated public repository before JS Contrib. For vendor
components, document installation, configuration, exposed APIs, and relevant
design; meet the repository's current test coverage; and establish an ongoing
maintainer who can review changes and respond to failures and issues.

### 2. Check for an existing target

```sh
test -d packages/<target> && echo existing
```

Also search for near matches and overlapping instrumentations:

```sh
find packages -maxdepth 1 -type d -iname '*<library>*'
rg -l '<library>|<sdk-package-name>' packages/*/package.json
```

If an equivalent package exists, use
[augment mode](#augment-mode-the-package-already-exists). Do not create a
competing package.

Known examples include:

- `instrumentation-openai`
- `instrumentation-langchain`
- AWS Bedrock coverage in `instrumentation-aws-sdk`

### 3. Check for native OpenTelemetry support

Prefer instrumentation owned by the library itself. Before porting:

1. Inspect the latest supported SDK package and documentation for built-in
   OpenTelemetry hooks, middleware, callbacks, or emitted GenAI spans.
2. Search the installed SDK for `@opentelemetry/api`,
   `@opentelemetry/semantic-conventions`, `gen_ai.`, and documented telemetry
   configuration.
3. Confirm behavior with a real `TracerProvider`; a dependency alone does not
   prove that the SDK emits conformant telemetry.

If the library is self-instrumented, do not migrate the OpenInference package.
Pivot the work:

1. **Ignore the OpenInference instrumentation entirely.** The vendor owns the
   spans, so there is no instrumentor or patcher to reimplement.
2. **Write conformance tests against the native instrumentation.** If
   `.github/skills/write-conformance-tests/SKILL.md` exists, follow it, but
   configure each scenario to enable the native tracer instead of an
   OpenTelemetry instrumentation package. If the skill is not present, skip
   authoring the tests for now and record that limitation in the migration
   report.
3. **Identify gaps and inconsistencies** between the native telemetry and the
   GenAI semantic conventions, including missing operations, incorrect
   operation names, legacy or duplicate attributes, missing metrics, and
   missing content-capture controls. Record each gap as an expected violation
   or documented skip.
4. **Write `MIGRATION_REPORT.md`** as described in
   [step 11](#11-write-the-migration-report), stating that the library is
   self-instrumented, the conformance results or reason tests were skipped, and
   the identified gaps. Stop and surface the finding to the user. Do not build
   a competing package unless they explicitly request it.

Only continue with the migration when the library has no native OpenTelemetry
instrumentation.

### 4. Check for shared GenAI utilities

The tracking issue calls for shared JavaScript GenAI utilities analogous to
Python's `opentelemetry-util-genai`. Check the current branch rather than
assuming they exist:

```sh
find packages -maxdepth 2 -type d -iname '*genai*'
rg -l 'gen_ai\.input\.messages|gen_ai\.output\.messages' packages
```

If a shared package exists, use only its public API. Do not import private
modules or duplicate its models inside an instrumentation.

If it does not exist:

- do not silently create a package-local pseudo-shared framework;
- follow the latest accepted GenAI instrumentation pattern in this repository;
- keep parsing helpers package-specific and small;
- record utility gaps in the migration report;
- split a broadly reusable utility into a separate prerequisite PR when
  multiple migrations need it.

## Reference material

Use these sources in priority order:

1. [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
2. [GenAI semantic convention schemas and models](https://github.com/open-telemetry/semantic-conventions/tree/main/docs/gen-ai)
3. [Semantic conventions conformance](https://github.com/open-telemetry/semantic-conventions-conformance)
4. [OpenTelemetry JavaScript instrumentation API](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation)
5. Existing packages in this repository that instrument a similar SDK shape
6. The single donated OpenInference package being migrated

The
[OpenInference-to-OpenTelemetry mapping](https://github.com/Arize-ai/openinference/blob/main/spec/genai/README.md)
is a useful cross-reference, but official OpenTelemetry semantic conventions
win whenever they differ.

## Non-negotiable rules

1. **Use the sanctioned donation source.** Do not port from the pre-donation
   Arize repository or npm tarballs when the donation repository contains the
   source.
2. **Zero OpenInference dependencies.** The target must not depend on
   `@arizeai/openinference-core`,
   `@arizeai/openinference-semantic-conventions`, or any other
   `@arizeai/openinference-*` package in `dependencies`, `devDependencies`, or
   `peerDependencies`.
3. **Official semantic conventions only.** Do not rename OpenInference
   attributes into plausible `gen_ai.*` strings. Every emitted attribute,
   event, metric, operation name, and span kind must come from the current
   OpenTelemetry semantic conventions or an explicitly documented gap.
4. **Preserve the instrumented API contract.** Instrumentation must not change
   return types, Promise subclasses, async iterables, callback behavior,
   `this`, exceptions, cancellation, streaming, or user hooks.
5. **Do not hide missing coverage.** If the semantic conventions, shared
   utilities, or SDK do not expose required information, add a failing or
   explicitly expected conformance case and document the gap.
6. **Content capture is opt-in.** Prompts, responses, tool arguments, tool
   results, and other potentially sensitive content must not be recorded by
   default. Follow the repository's established
   `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` behavior unless the
   current semantic conventions specify a replacement.
7. **Respect tracing suppression and active context.** Do not create telemetry
   when tracing is suppressed. Run the original operation in the intended
   context so child spans and callbacks retain correct parentage.
8. **Use SDK types.** Prefer `import type` from the instrumented SDK and narrow
   unknown values with type guards. Do not introduce broad `any` types or
   hand-written copies of vendor types.
9. **Do not leak credentials or customer data.** Sanitize recorded fixtures,
   headers, URLs, request bodies, response bodies, IDs, and account metadata.
10. **Do not copy unrelated OpenInference framework behavior.** Session, user,
    metadata, tags, masking, and tracer configuration should only survive when
    they map to official OpenTelemetry APIs or an accepted target-package
    configuration.
11. **Use this repository's toolchain.** The donation repository uses pnpm and
    changesets, but this repository uses npm workspaces, Nx, and release-please.
    Do not copy `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.changeset`, or
    donation release configuration.
12. **Emit only operations the library owns.** A framework that delegates model
    calls, embeddings, retrieval, or tool execution to another instrumentable
    library must not re-emit that library's telemetry. Emit an operation only
    when the target library implements that concept itself or calls a boundary
    that no other instrumentation can observe, such as a direct provider HTTP
    request.

Verify the dependency rule:

```sh
rg '@arizeai/openinference|openinference-(core|semantic-conventions)' \
  packages/<target>/src packages/<target>/test packages/<target>/package.json
```

The output must be empty.

## Augment mode: the package already exists

OpenInference is a second coverage reference, not permission to rewrite an
existing package.

### Inventory the existing package first

Record:

- every module, class, prototype, method, callback, or middleware hook patched;
- supported SDK versions and module formats;
- request and response shapes parsed;
- spans, attributes, events, logs, and metrics emitted;
- content-capture behavior;
- streaming, error, suppression, and context behavior;
- unit, integration, version-matrix, auto-instrumentation, and conformance
  tests.

### Inventory the donated package separately

Read its instrumentor, wrappers, helpers, tests, examples, and fixtures. List
the same categories without assuming that OpenInference behavior should be
preserved.

### Compute the delta

Add only:

- operations the existing package does not instrument;
- valid SDK request or response branches it drops;
- official semantic convention data it can provide but does not;
- streaming or error paths it misses;
- test scenarios that reveal a concrete gap.

Leave existing behavior alone when both packages cover it. Keep capabilities
that exist only in the OpenTelemetry package. Put opportunistic refactors in a
follow-up PR.

## Migration flow

> The numbered steps below apply to both migration modes. For a greenfield
> migration, follow every step. In
> [augment mode](#augment-mode-the-package-already-exists), the inventories and
> delta above replace step 1, skip step 2, and scope steps 3-9 to that delta.
> Perform step 10 only when the new capability changes workspace integration,
> then complete the reporting and validation in steps 11-12.

### 1. Create a source inventory

Before editing, produce a table for the donated package:

| Surface | Required inventory |
| --- | --- |
| Entry points | Patched modules, classes, methods, callbacks, and middleware |
| Versions | Supported SDK and Node.js ranges |
| Inputs | Every accepted request shape and option |
| Outputs | Every response, stream event, tool call, and usage shape |
| Telemetry | Spans, attributes, events, logs, metrics, and links |
| Control flow | Sync, Promise, callback, stream, async iterable, cancellation |
| Tests | Scenario, fixture, and assertion represented by each test |

Inspect tests before deciding what code is reusable. Test cases often contain
the only complete inventory of provider response shapes.

### 2. Scaffold the target package

For greenfield migrations, start from the nearest maintained package in this
repository instead of copying the donated package wholesale. Match:

- Node.js and TypeScript targets;
- `InstrumentationBase` or middleware architecture;
- CJS and ESM loading;
- Mocha, `expect`, Sinon, and Nock conventions;
- `test-all-versions` and `.tav.yml`;
- README structure and package metadata.

A typical package contains:

```text
packages/<target>/
  src/
    index.ts
    instrumentation.ts
    internal-types.ts
    semconv.ts
    types.ts
  test/
    load-instrumentation.ts
    <library>.test.ts
    mock-responses/
  .tav.yml
  CHANGELOG.md
  LICENSE
  package.json
  README.md
  tsconfig.json
```

Only create files the package needs. Middleware-based integrations may not
need `instrumentation.ts` or `.tav.yml`.

Do not copy the donated README, changelog entries, examples, workspace
configuration, generated build output, lockfile, or agent configuration. For a
new package, create the repository-standard `CHANGELOG.md` heading when recent
package additions do so; release-please owns subsequent changelog entries.
Copy reusable test fixtures only after sanitizing and reviewing them.

For a new package:

- use the current repository package version convention;
- set `repository.directory`, `homepage`, keywords, files, engines, peer
  dependencies, and scripts consistently;
- include `compile:with-dependencies`, `lint:readme`, and `version:update`
  scripts following a current package;
- depend on `@opentelemetry/api` as a peer dependency;
- keep the vendor SDK in `devDependencies` unless runtime code truly imports a
  required runtime type or value;
- use workspace dependency versions already present in the root lockfile;
- extend `../../tsconfig.base` and include both `src/**/*.ts` and `test/**/*.ts`;
- add the standard OpenTelemetry copyright and Apache-2.0 SPDX header to every
  JavaScript and TypeScript source and test file.

Do not create or commit `src/version.ts`. It is ignored and generated from
`package.json` by `scripts/version-update.js`; Nx runs `version:update` before
`compile`.

Run `npm install` from the repository root to update `package-lock.json`; do
not edit the lockfile manually.

The README must pass `scripts/lint-readme.js`. Copy the current badge block,
installation guidance, supported versions, usage style, useful-links footer,
and license reference from a maintained package, then adapt the package-specific
content.

### 3. Remove OpenInference plumbing

Do not begin by renaming every OpenInference symbol. Separate reusable SDK
parsing logic from framework-specific behavior.

Remove or replace:

- `OITracer`, OpenInference tracer wrappers, and OpenInference span-kind
  decisions;
- `TraceConfig` and OpenInference-specific masking;
- OpenInference semantic convention constants;
- OpenInference context-attribute helpers;
- OpenInference-specific JSON serialization;
- dependencies on `openinference-core` and
  `openinference-semantic-conventions`.

Retain only logic that represents real SDK behavior, such as:

- request and response type guards;
- stream accumulation;
- tool-call assembly;
- usage extraction;
- provider error extraction;
- documented middleware or callback wiring.

Rewrite retained logic to return OpenTelemetry-ready values rather than
OpenInference attribute maps.

### 4. Choose the correct instrumentation boundary

Prefer documented, stable extension points in this order:

1. native telemetry configuration;
2. public middleware, callback, plugin, or hook APIs;
3. public SDK methods patched with `InstrumentationBase`;
4. private or transport-level hooks only when no stable alternative exists and
   maintainers accept the compatibility cost.

For module patching:

- extend `InstrumentationBase`;
- declare supported versions with `InstrumentationNodeModuleDefinition` and,
  when needed, `InstrumentationNodeModuleFile`;
- patch with `_wrap` and restore with `_unwrap`;
- handle both CommonJS and ESM export shapes;
- patch all relevant public entry points;
- guard optional APIs by SDK version;
- keep enable and disable idempotent.

For middleware or callback integrations, follow the SDK's documented
registration model while preserving tracing suppression, context propagation,
configuration, and cleanup.

Never replace a customized Promise or stream object with a plain Promise or
iterable. Attach observation to the original object when required.

Instrumentation-internal extraction failures must not break the application.
Log them through the instrumentation diagnostic logger and preserve the
original result. Vendor SDK failures are not instrumentation failures: record
the error telemetry, end the span, and rethrow or reject with the original
error.

### 5. Map operations to OpenTelemetry GenAI conventions

For every operation:

1. determine the current official operation name;
2. determine whether the span is `CLIENT` or `INTERNAL`;
3. use the required span name;
4. add required and conditionally required attributes;
5. add metrics, events, or logs required by the convention;
6. handle success, provider error, cancellation, and partial streams;
7. decide which content fields are safe without opt-in capture.

Common categories include:

| SDK behavior | GenAI operation family |
| --- | --- |
| Chat or message generation | `chat` |
| Text completion | `text_completion` |
| Vector generation | `embeddings` |
| Agent execution | `invoke_agent` |
| Workflow or chain execution | `invoke_workflow` |
| Tool execution | `execute_tool` |
| Retrieval or ranking | `retrieval` |

Do not use this table instead of the current specification. Operation names
and required attributes can change while GenAI conventions are experimental.

Map every accepted SDK message part, including:

- system, developer, user, assistant, and tool messages;
- tool calls and tool results;
- reasoning or thinking content;
- text, image, audio, video, file, and URI parts;
- provider-hosted tool calls and results;
- refusal, citation, and structured-output parts;
- streamed deltas that must be accumulated into a final logical message.

Never silently discard an unsupported provider-specific part. Preserve
non-sensitive identifying structure where the convention allows it and record
the missing semantic mapping in the migration report.

### 6. Manage unstable semantic convention constants

GenAI conventions are experimental. Instrumentation runtime code should not
import unstable definitions from
`@opentelemetry/semantic-conventions/incubating`.

Follow the
[OpenTelemetry JavaScript unstable semantic convention guidance](https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv):

- copy only the required unstable constants into `src/semconv.ts`;
- retain links or comments identifying the semantic convention version;
- import stable constants from `@opentelemetry/semantic-conventions`;
- use named constants and enum values instead of repeated string literals;
- review copied constants whenever the package updates its semantic convention
  version.

Do not copy an existing GenAI `semconv.ts` blindly. Compare it with the latest
specification and conformance policies first.

### 7. Implement privacy-safe content capture

Default telemetry must exclude sensitive content. Content capture should:

- be disabled unless explicitly enabled;
- use one documented package option;
- honor `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` when consistent
  with current repository practice;
- omit content fields instead of replacing them with misleading empty values;
- apply consistently to spans, events, logs, and tool arguments or results;
- preserve non-content fields needed for schema validity.

Test both content-disabled and content-enabled modes. Ensure recorded fixtures
do not expose the content merely because tests run with capture enabled.

### 8. Migrate the test corpus

Classify every donated test:

- **Migrate**: covers a real SDK operation or request or response shape.
- **Migrate and rewrite**: tests an OpenInference helper, but the scenario is
  still required to verify parsing, streaming, tool calls, usage, or errors.
- **Skip with reason**: covers only OpenInference tracer configuration,
  context attributes, masking, semantic convention names, or other framework
  behavior with no OpenTelemetry equivalent.

Do not skip a test because its code cannot be copied. Preserve the scenario at
the public SDK boundary.

Required coverage, where applicable:

- instrumentation disabled;
- tracing suppressed;
- successful non-streaming operation;
- provider or SDK error with the original error preserved;
- streaming success;
- streaming error and early termination;
- callbacks or user hooks;
- active-context parentage;
- content capture off and on;
- tool calls and tool results;
- usage and finish reasons;
- CommonJS and ESM loading;
- manual and auto-instrumentation registration;
- oldest and latest supported SDK versions.

Use deterministic mocks or Nock recordings. Reuse donated recordings only
after verifying their response bodies and sanitizing secrets. Follow the
existing package's `nockBack` pattern when recorded provider responses are
valuable.

For generated recordings that could not be captured from a real provider:

- label them clearly as generated test data;
- base them on the provider's public API schema;
- mention them in the pull request;
- create a follow-up issue to replace them with real sanitized recordings.

Compare source and target test inventories before declaring the migration
complete. A large unexplained reduction indicates missing coverage.

### 9. Add semantic convention conformance tests

Use
[`open-telemetry/semantic-conventions-conformance`](https://github.com/open-telemetry/semantic-conventions-conformance)
and the repository's latest accepted Weaver integration.

Before adding infrastructure, search the current branch and recent accepted
migration PRs for the established scenario layout and commands. Reuse that
pattern rather than introducing a second conformance runner.

Each supported operation should have a scenario that:

- executes the public SDK surface;
- captures exported telemetry;
- runs current Weaver policies;
- asserts provider-specific data not covered by generic policies;
- tests content capture separately when relevant.

Conformance tests must not silently skip because Weaver, the semantic
conventions, or a shared utility lacks coverage. Use an explicit expected
violation with a narrow reason and record it in the migration report.

Do not modify upstream Weaver policies to make a package pass.

### 10. Integrate the package into the workspace

For a greenfield instrumentation, inspect a recently added package and update
all applicable surfaces:

- root `package-lock.json` through `npm install`;
- `.release-please-manifest.json`;
- `release-please-config.json`;
- `.github/component_owners.yml`;
- `.github/component-label-map.yml` through
  `node scripts/gen-component-label-map.mjs`;
- `packages/auto-instrumentations-node/package.json`;
- `packages/auto-instrumentations-node/src/utils.ts`;
- auto-instrumentation README and tests;
- package README, `.tav.yml`, and supported-version tests.

Keep package entries alphabetized in the release and component-owner files.
The component label map is generated; do not edit it by hand.

Every new instrumentation requires at least two agreed code owners according
to `CONTRIBUTING.md`. Do not list someone as an owner without their agreement.

In augment mode, update workspace files only when the new capability changes a
dependency, supported version, auto-registration, or user-facing behavior.

### 11. Write the migration report

Create `MIGRATION_REPORT.md` while developing. Unless maintainers request that
it be committed, post its final contents as a pull request comment and remove
the working file before the final commit.

Include:

1. source package and exact donation commit;
2. target package and greenfield or augment mode;
3. native-instrumentation investigation;
4. shared-utility decision;
5. operation coverage table: donated, pre-existing, migrated, intentionally
   omitted;
6. request and response shape coverage;
7. source-test disposition: migrated, rewritten, skipped with reason;
8. semantic convention and conformance results;
9. privacy and fixture-sanitization review;
10. known gaps, expected violations, and follow-up issues;
11. validation commands and results.

The report should list only actionable gaps after the implementation is
complete.

### 12. Validate and open the pull request

Install from the repository root:

```sh
npm ci
```

Run the smallest commands that cover the package and its integration:

```sh
npm run compile:with-dependencies -w @opentelemetry/<target>
npm test -w @opentelemetry/<target>
npm run --if-present test-all-versions -w @opentelemetry/<target>
npm run lint:readme -w @opentelemetry/<target>
```

Also run:

- the package's conformance command;
- auto-instrumentations-node tests when registration changed;
- formatting and ESLint for changed files;
- affected compile and tests when available;
- root dependency, Markdown, README, and semantic convention dependency
  checks that cover the change. `npm run lint:deps` requires Node.js 24 or
  later.

Review the final diff for generated files, secrets, OpenInference references,
unrelated refactors, and missing workspace wiring.

Use a conventional pull request title, link
[`#3668`](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3668),
identify the donated source, and summarize:

- operations migrated;
- intentional omissions;
- conformance status;
- validation performed;
- component ownership.

## Completion checklist

- [ ] The package is claimed in the tracking issue.
- [ ] The instrumentation request is accepted and has two agreed code owners.
- [ ] The migration uses `open-telemetry/donation-openinference`.
- [ ] Existing and native instrumentation were evaluated.
- [ ] No OpenInference dependencies remain.
- [ ] Every emitted convention is official or documented as a gap.
- [ ] Public SDK behavior and return contracts are preserved.
- [ ] Content capture is disabled by default.
- [ ] Suppression, context, errors, and streaming are covered.
- [ ] Donated tests have an explicit disposition.
- [ ] Conformance scenarios cover every supported operation.
- [ ] Fixtures contain no secrets or customer data.
- [ ] Package and workspace integration is complete.
- [ ] Component ownership is established.
- [ ] The migration report has no unexplained coverage gaps.
- [ ] Targeted and affected validation passes.
