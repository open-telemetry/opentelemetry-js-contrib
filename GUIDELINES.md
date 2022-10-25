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
