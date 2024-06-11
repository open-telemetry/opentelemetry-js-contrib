# Test Utils for OpenTelemetry contrib packages

This is a internal utils package used across the contrib packages.
No guarantees are given to uses outside of [open-telemetry/opentelemetry-js-contrib](https://github.com/open-telemetry/opentelemetry-js-contrib/) repository.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Instrumentation Testing

This package exports a mocha [root hook plugin](https://mochajs.org/#root-hook-plugins), which implements common boilerplate code a developer probably needs for writing instrumentation unit tests in node.

This package:

- Initializes and registers a global trace provider for tests.
- Registers a global memory exporter which can be referenced in test to access span.
- Make sure there is only a single instance of an instrumentation class that is used across different `.spec.ts` files so patching is consistent, deterministic and idiomatic.
- Reset the memory exporter before each test, so spans do not leak from one test to another.
- Optionally - export the test traces to Jaeger for convenience while debugging and developing.

By using this package, testing instrumentation code can be shorter, and good practices for writing tests are more easily applied.

### Supported Version

Since [root hook plugin](https://mochajs.org/#root-hook-plugins) are used, this package is compatible to mocha v7.2.0 and above.

### Usage

1. Add dev dependency on this package:

```sh
npm install @opentelemetry/test-utils --save-dev
```

1. [`require`](https://mochajs.org/#-require-module-r-module) this package in mocha invocation:

As command line argument option to mocha:

```js
    "scripts": {
        "test": "mocha --require @opentelemetry/test-utils",
        "test:jaeger": "OTEL_EXPORTER_JAEGER_AGENT_HOST=localhost mocha --require @opentelemetry/test-utils",
    },
``

Or by using config file / package.json config:
```js
    "mocha": {
        "require": [ "@opentelemetry/test-utils" ]
    }
```

1. In your `.spec` file, import `registerInstrumentationTesting` and `getTestSpans` functions and use them to create instrumentation class instance and make assertions in the test:

```js
import { getTestSpans, registerInstrumentationTesting } from '@opentelemetry/test-utils';

const instrumentation = registerInstrumentationTesting(new MyAwesomeInstrumentation());

it('some test', () => {
    // your code that generate spans for this test
    const spans: ReadableSpan[] = getTestSpans();
    // your code doing assertions with the spans array
});
```

That's it - supper short and easy.

## Semantic Conventions

This package uses `@opentelemetry/semantic-conventions` version `1.22+`, which implements Semantic Convention [Version 1.7.0](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.7.0/semantic_conventions/README.md)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
