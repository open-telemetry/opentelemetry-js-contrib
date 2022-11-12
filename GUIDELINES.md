# Instrumentations Implementation Guide

This document captures general guidelines for implementing instrumentations in NodeJS and browser.

## Types

### Public Types

Public types are meant to be consumed by instrumentation users (OpenTelemetry distribution packages or end users implementing OpenTelemetry in their services). These are mostly instrumentation specific config interface (extending `InstrumentationConfig`) and the transitive types used in the config.

#### File Name

These typescript `interface`s, `type`s, `enum`s and js `const`ants statements SHOULD be placed in a file named `types.ts`. This file SHOULD contain only public types that are needed for instrumentation users.

#### Exporting

All types from `types.ts` file MUST be exported from instrumentation `index.ts` using export statement `export * from './types'`, which guarentee that they publicly available.

#### Breaking Changes

Since these types are publicly exported, a breaking change in this file can cause transpilation issues or require code changes for existing users. Special care and attention should be put when modifiying this file to guarantee backword compatibility or proper documentation of breaking changes.

### Internal Types

All types and constants that instrumentation needs internally to implement the instrumentation logic. This can include extensions to instrumented package interfaces (for example - when adding data to existing objects), symbols for patches, enums etc.

#### File Name

It is sometimes convenient to place these declarations in a dedicated file which can then be imported from various instrumentation files such as `instrumentation.ts`, `utils.ts` or test files.

The file SHOULD be named `internal-types.ts`.

Using this file is optional - when a type is used only in a single file, it is ok to declare it and use it in this file **without exporting it**. When a type is expected to be shared between multiple files, it is encourged to be declared in `internal-types.ts` to prevent circular dependencies.

#### Exporting

This file MUST NOT be exported publicly from instrumentation package, not directly (via `index.ts`) and not transitivly via export of other files.

#### Changes

Since the declarations in this file are not exported in the public instrumentation api, it is allowed to apply any refactors to this file, and they will not be breaking changes to users.

## Dependencies

This section refers to the "dependencies" and "peerDependencies" entries in instrumentation's `package.json` file.

Since instrumentations will install all their dependencies into the end user `node_modules` application, they should be examined to guarantee only small-size-required packages are added.

### OpenTelemetry API

Instrumentation SHOULD NOT add a dependency on `@opentelemetry/api`, as using multilpe instrumentations might install multiple api versions into the user node_modules directory. It SHOULD add an entry in `"peerDependencies"` in `package.json` with the **minimum** api version it requires, as caret range (for example: `^1.0.0`).

Users and distributions need to install a version of `@opentelemetry/api` that is compatible with the instrumentation to use it.

### OpenTelemetry Core packages

Most instrumentations will depend on `@opentelemetry/instrumentation` and `@opentelemetry/semantic-conventions`. If needed, instrumentation can also depend on `@opentelemetry/core` for use of handy utils.

Instrumentation SHOULD specify dependency as caret range (`^1.0.0`), with minimum supported version (and not latest version). If a specific feature or bug fix is required for instrumentation to function correctly, it SHOULD specify the minimum version that includes this feature.

### Instrumented Package Dependency

Instrumentations SHOULD NOT add a `"dependency"` or `"peerDependencies"` on the package it is instrumenting as it can end up installing this package into users' applications, adding large overhead.

This means that the instrumentation code SHOULD NOT `import` anywhere from the instrumented package. e.g. `@opentelemetry/instrumentation-foo` cannot `import 'foo'` as it will fail for applications that installed the instrumentation but not the `foo` package itself, which is a valid and supported use case for OpenTelemetry distributions and end users.

It is allowed, however, to import `types`  from the instrumented package with the [`import type`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export) syntax, as long as this type is not used in public api:

```js
// instrumentation.ts
import type { Bar } from 'foo'; // OK
```

Since the instrumented package is installed as a dev dependency, types are available during compiling. Since they are not part of the public api, typescript removes these imports from the build artifacts during transpilation.

### Types Public API

When users install an instrumentation package into their typescript application, and `import * from '@opentelemetry/instrumentation-foo'` in their code, typescript compiler will look for the instrumentation package ["types"](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html#including-declarations-in-your-npm-package) file `index.d.ts` and use it. If this file reference other type files such as `export * from './instrumentation';`, typescript will then import and transpile these files (and other transitive files they might use) as well. We will call these files "public" as they are exposed to the package consumers and processed by their typescript compiler when transpiling their applications.

If one of these files `import`s from a package that is not in users' `node_module` directory, the instrumentation package will fail transpilation for the end users' application which should be avoided. A common problem is "leaking" the types from the instrumented package (which we cannot assume to be found in end-user `node_module`) in one of these public modules ".d.ts" files.

When invoking `npm run compile` on the instrumentation package, typescript will generate the `.d.ts` types files in the `build` directory and will only include in them "public" types - those that can be consumed by the user of the module. These may include:

- Types that are `export`ed from the module, or types that are transitively used in other types that are `export`ed from the module.
- Types in `public` functions of exported classes such as `class InstrumentationFoo`.
- Types used as [`Generic Type Varibles`] on exported generic types/classes/functions.

Note that types that are used in non-public files (like `internal-types.ts` or `utils.ts`), or that are not somehow `export`ed from a module (for example - used in private function implementations), can safely use types from a "devDependency" package.

### Adding Types in Public API

Sometimes, instrumented package types are needed in instrumentation's public api. These are mostly found in `types.ts` file on instrumentation config hooks that include data from the package and want to type it for consumers.

To support this use case, you can choose one of the following options:

1. Some packages do not distribute types. The types are alternatively available in the [Definitely Typed Project](https://github.com/DefinitelyTyped/DefinitelyTyped) as `@types/foo` (for a package named `foo`). Since @type package is mostly small in size, instrumentation MAY add dependency on the types package, and then use type-only import `import type from 'foo'` in `types.ts`.

    ```js
    // package.json
    {
        ...
        "dependencies": {
            "@types/foo": "1.2.3"
        },
        ...
    }

    // types.ts
    import type { Bar } from 'foo';

    export interface FooRequestInfo {
        bar: Bar;
    }

    ...
    ```

    If possible, this is the prefered options, as it uses types from a maintained package.

    Notice that types may introduce breaking changes in major semver releases, and instrumentation should choose a `@types/` package that is compatible with the version range it supports.

2. Copy the relevant type declarations into the instrumentation. You may choose to copy only a subset of the type that is relevant to the need.

    A type can transitively reference other types which in turn need to be copied as well.

    This option requires maintaining the types in the instrumentation codebase, which is not ideal. On the other end, it offers instrumentation users typing on its public API which is convenient.

    It is recommended to use this option when the types involved are simple and short.

3. Use `any` type, and add a comment to guide users on what type they should expect, with a link to its definition.

    This option will offer no typing aid to the instrumentation consumer, which will move the burden and risk of checking type correctness to the user.

    It is recommended to implement it only if the previous options are not feasible or are too complex to use.
