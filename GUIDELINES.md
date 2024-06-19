# Instrumentations Implementation Guide

This document captures general guidelines for implementing instrumentations in Node.js and browser.

## Types

### Public Types

Public types are meant to be consumed by instrumentation users (OpenTelemetry distribution packages or end users implementing OpenTelemetry in their services). These are mostly instrumentation specific config interface (extending `InstrumentationConfig`) and the transitive types used in the config.

#### File Name

These typescript `interface`s, `type`s, `enum`s and js `const`ants statements SHOULD be placed in a file named `types.ts`. This file SHOULD contain only public types that are needed for instrumentation users.

#### Exporting

All types from `types.ts` file MUST be exported from instrumentation `index.ts` using export statement `export * from './types'`, which guarantee that they publicly available.

#### Breaking Changes

Since these types are publicly exported, a breaking change in this file can cause transpilation issues or require code changes for existing users. Special care and attention should be put when modifying this file to guarantee backward compatibility or proper documentation of breaking changes.

### Internal Types

All types and constants that instrumentation needs internally to implement the instrumentation logic. This can include extensions to instrumented package interfaces (for example - when adding data to existing objects), symbols for patches, enums etc.

#### File Name

It is sometimes convenient to place these declarations in a dedicated file which can then be imported from various instrumentation files such as `instrumentation.ts`, `utils.ts` or test files.

The file SHOULD be named `internal-types.ts`.

Using this file is optional - when a type is used only in a single file, it is ok to declare it and use it in this file **without exporting it**. When a type is expected to be shared between multiple files, it is encouraged to be declared in `internal-types.ts` to prevent circular dependencies.

#### Exporting

This file MUST NOT be exported publicly from instrumentation package, not directly (via `index.ts`) and not transitively via export of other files.

#### Changes

Since the declarations in this file are not exported in the public instrumentation API, it is allowed to apply any refactors to this file, and they will not be breaking changes to users.

## Dependencies

This section refers to the "dependencies" and "peerDependencies" entries in instrumentation's `package.json` file.

Since instrumentations will install all their dependencies into the end user `node_modules` application, they should be examined to guarantee only small-size-required packages are added.

### OpenTelemetry API

Instrumentation SHOULD NOT add a dependency on `@opentelemetry/api`, as using multiple instrumentations might install multiple API versions into the user node_modules directory. It SHOULD add an entry in `"peerDependencies"` in `package.json` with the **minimum** API version it requires, as caret range (for example: `^1.0.0`).

Users and distributions need to install a version of `@opentelemetry/api` that is compatible with the instrumentation to use it.

### OpenTelemetry Core packages

Most instrumentations will depend on `@opentelemetry/instrumentation` and `@opentelemetry/semantic-conventions`. If needed, instrumentations can also depend on `@opentelemetry/core` for use of handy utils.

Instrumentations SHOULD specify these dependencies as caret range (`^1.0.0`), with minimum supported version (and not latest version). If a specific feature or bug fix is required for instrumentation to function correctly, it SHOULD specify the minimum version that includes this feature.

### Instrumented Package Dependency

Instrumentations SHOULD NOT add a `"dependency"` or `"peerDependencies"` on the package it is instrumenting as it can end up installing this package into users' applications, adding large overhead.

This means that the instrumentation code SHOULD NOT `import` anywhere from the instrumented package. e.g. `@opentelemetry/instrumentation-foo` cannot `import 'foo'` as it will fail for applications that installed the instrumentation but not the `foo` package itself, which is a valid and supported use case for OpenTelemetry distributions and end users.

It is allowed, however, to import `types`  from the instrumented package with the [`import type`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export) syntax, as long as this type is not used in the public API:

```js
// instrumentation.ts
import type { Bar } from 'foo'; // OK
```

Since the instrumented package is installed as a dev dependency, types are available during compiling. Since they are not part of the public API, typescript removes these imports from the build artifacts during transpilation.

### Types Public API

When users install an instrumentation package into their typescript application, and `import * from '@opentelemetry/instrumentation-foo'` in their code, typescript compiler will look for the instrumentation package ["types"](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html#including-declarations-in-your-npm-package) file `index.d.ts` and use it. If this file reference other type files such as `export * from './instrumentation';`, typescript will then import and transpile these files (and other transitive files they might use) as well. We will call these files "public" as they are exposed to the package consumers and processed by their typescript compiler when transpiling their applications.

If one of these files `import`s from a package that is not in users' `node_module` directory, the instrumentation package will fail transpilation for the end users' application which should be avoided. A common problem is "leaking" the types from the instrumented package (which we cannot assume to be found in end-user `node_module`) in one of these public modules ".d.ts" files.

When invoking `npm run compile` on the instrumentation package, typescript will generate the `.d.ts` types files in the `build` directory and will only include in them "public" types - those that can be consumed by the user of the module. These may include:

- Types that are `export`ed from the module, or types that are transitively used in other types that are `export`ed from the module.
- Types in `public` functions of exported classes such as `class InstrumentationFoo`.
- Types used as [`Generic Type Varibles`] on exported generic types/classes/functions.

Note that types that are used in non-public files (like `internal-types.ts` or `utils.ts`), or that are not somehow `export`ed from a module (for example - used in private function implementations), can safely use types from a "devDependency" package.

### Adding Types in Public API

Sometimes, instrumented package types are needed in an instrumentation's public API. These are mostly found in `types.ts` file on instrumentation config hooks that include data from the package and want to type it for consumers.

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

    If possible, this is the preferred option, as it uses types from a maintained package.

    Notice that types may introduce breaking changes in major semver releases, and instrumentation should choose a `@types/` package that is compatible with the version range it supports.

2. Copy the relevant type declarations into the instrumentation. You may choose to copy only a subset of the type that is relevant to the need.

    A type can transitively reference other types which in turn need to be copied as well.

    This option requires maintaining the types in the instrumentation codebase, which is not ideal. On the other end, it offers instrumentation users typing on its public API which is convenient.

    It is recommended to use this option when the types involved are simple and short.

3. Use a [generic type](https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-types) and add a comment to guide users on what type they should use, with a link to its definition.

    This approach is useful when types have breaking changes within the versions supported and there are too many declarations to copied over.

    This option will offer typing aid to the instrumentation consumer with the same version of types is used in the instrumented application.

    You may import the types package for internal use but use generics for the types you want to export.

    ```js
    // package.json
    {
        "name": "@opentelemetry/instrumentation-bar",
        ...
        "devDependencies": {
            "@types/foo": "1.2.3"
        },
        ...
    }

    // types.ts

    export interface FooRequestInfo<BarType = any> {
        bar: BarType;
    }
    ...
    ```

    ```js
    // app.ts
    import { FooRequestInfo } from "@opentelemetry/instrumentation-bar";
    import type { Bar } from 'foo';

    const requestInfo: FooRequestInfo<Bar> = {
        bar: { ... },
    };
    ...
    ```

## Diag Logging

The OpenTelemetry diagnostic logging channel can be used to troubleshoot issues with instrumentation packages.

### Patching Messages

When OpenTelemetry is installed in a user application, and expected spans are missing from generated traces, it is often useful to differentiate between the following scenarios:

- The instrumentation is not auto loaded - due to issue with the require/import interception, an unsupported version of the instrumented package, or some other issue. This knowledge can pin-point the issue to the instrumentation package.
- The instrumentation patch was applied but expected spans are missing -- this can suggest an issue with instrumented package logic, configuration, limits, otel sdk, or other issues.

It can also be useful to know when the instrumentation is loaded and patched, to understand the order of operations in the application.

Instrumentation packages should use the `@opentelemetry/instrumentation` package `InstrumentationBase` class to register patches and unpatch callbacks for specific require/import of the instrumented package, it's dependency or an internal module file. When this mechanism is used, the base class will automatically emit a debug message on instrumentation diag component logger, looking like this:

```shell
@opentelemetry/instrumentation-foo Applying instrumentation patch for module on require hook {
  module: 'foo',
  version: '1.2.3',
  baseDir: '<your directory>/node_modules/foo'
}
```

Instrumentation should not add additional debug messages for triggering the patching and unpatching callbacks, as the base class will handle this.

Instrumentation may add additional patch/unpatch messages for specific functions if it is expected to help in troubleshooting issues with the instrumentation. Few examples:

- If the patch logic is conditional, and user can benefit from ensuring the condition is met and the patch happened. `koa` patching logic examine an object and branch between patching it as router vs middleware, which is applied at runtime. `aws-lambda` will abort patching if the environment is not configured properly.
- When the patch is not applied directly on a `moduleExports` object in the `InstrumentationBase` callbacks, but rather from an event in the package, like creating new client instance, registering a listener, etc. `fastify` instrumentation applies a patch when a hook is added to the fastify app instance, which is patched from `moduleExports`.
- In situations where the patch logic is not trivial and it helps to specify patch events in the right context and nuances. `aws-lambda` logs additional properties extracted from the lambda framework and exposes them for troubleshooting.

The cases above are not covered by the base class and offer additional context to the user troubleshooting an issue with the instrumentation.

## package.json

### Description

Instrumentation should include a `description` field in the `package.json` file. The description targets human readers and is an opportunity to communicate the use case for the instrumented package and its semconv namespace. It should help users know whether the package fits their application, which is especially helpful if the package has a shortened or obscure name.

The description should be written with this format when applicable:

```text
"OpenTelemetry instrumentation for `<instrumented-package-name>` <package short description>"
```

For example:

```text
"OpenTelemetry instrumentation for `express` http framework"
"OpenTelemetry instrumentation for `winston` logger"
"OpenTelemetry instrumentation for `redis` database client for Redis"
```

If the package is consumed directly, the description should state the package name in `<instrumented-package-name>`. Tools like `nestjs` and `aws-lambda` are examples of packages that are consumed indirectly.

A short description should follow the package name, like "http framework", "logger", "database client for X", "messaging client", etc as appropriate in each case. It is preferable to use the semconv namespace semantics that are emitted by this instrumentation (`http`, `database`, `messaging`, `rpc`, `net`) to give quick context for the scope of the instrumentation.
