# Instrumentation Examples

:warning: Note: We are working on migrating these examples to their respective package directories.

For instance, examples of using `express` instrumentation have moved from this directory to [plugins/node/opentelemetry-instrumentation-express](https://github.com/open-telemetry/opentelemetry-js/tree/main/plugins/node/opentelemetry-instrumentation-express).

## Instructions for Migrating an Example

* [ ] Move the files
  * [ ] Choose an instrumentation package to migrate examples for.
  * [ ] Move the examples from `./examples/[name]` to `./plugins/[node or web]]/opentelemetry-instrumentation-[name]/examples`.
* [ ] Update the `package.json` in the examples folder
  * [ ] Remove the `@opentelemetry/instrumentation-[name]` dependency.
  * [ ] Install `typescript` and `ts-node` in the examples directory.
  * [ ] Replace usage of `node` in scripts with `ts-node`.
  * [ ] Add a script for compiling the code in scripts: `"compile": "tsc -p ."`
* [ ] Add a tsconfig.json file in the examples folder. (Example below)
* [ ] Update the code
  * [ ] Change code to use a relative import of the library.
  * [ ] Add types to the code
* [ ] Update the instrumentation package's `package.json`
  * [ ] Add a script `"compile:examples": "cd examples && npm run compile",`.
* [ ] Test the updated code
  * [ ] Test building the examples by running `npm run compile:examples`
  * [ ] Test that the actual exapmle code runs as expected

Example tsconfig.json file:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
  },
  "include": [
    "src/**/*.ts",
  ]
}
```
