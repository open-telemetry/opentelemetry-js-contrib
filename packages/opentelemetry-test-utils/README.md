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

| Attributes              | Description                                                                                   | Notes                                     |
| ------------------------| --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| cloud.account.id        | The cloud account ID the resource is assigned to.                                             | Key: `SEMRESATTRS_CLOUD_ACCOUNT_ID`       |
| cloud.availability_zone | Availability zone represents the zone where the resource is running.                          | Key: `SEMRESATTRS_CLOUD_AVAILABILITY_ZONE`|
| cloud.provider          | Name of the cloud provider.                                                                   | Key: `SEMRESATTRS_CLOUD_PROVIDER`         |
| cloud.region            | The geographical region the resource is running.                                              | Key: `SEMRESATTRS_CLOUD_REGION`           |
| container.id            | Container ID. Usually a UUID.                                                                 | Key: `SEMRESATTRS_CONTAINER_ID`           |
| container.image.name    | Name of the image the container was built on.                                                 | Key: `SEMRESATTRS_CONTAINER_IMAGE_NAME`   |
| container.image.tag     | Container image tag.                                                                          | Key: `SEMRESATTRS_CONTAINER_IMAGE_TAG`    |
| container.name          | Container name.                                                                               | Key: `SEMRESATTRS_CONTAINER_NAME`         |
| host.id                 | Unique host ID.                                                                               | Key: `SEMRESATTRS_HOST_ID`                |
| host.image.id           | VM image ID.                                                                                  | Key: `SEMRESATTRS_HOST_IMAGE_ID`          |
| host.image.name         | Name of the VM image or OS install the host was instantiated from.                            | Key: `SEMRESATTRS_HOST_IMAGE_NAME`        |
| host.image.version      | The version string of the VM image.                                                           | Key: `SEMRESATTRS_HOST_IMAGE_VERSION`     |
| host.name               | Name of the host.                                                                             | Key: `SEMRESATTRS_HOST_NAME`              |
| host.type               | Type of host.                                                                                 | Key: `SEMRESATTRS_HOST_TYPE`              |
| k8s.cluster.name        | The name of the cluster.                                                                      | Key: `SEMRESATTRS_K8S_CLUSTER_NAME`       |
| k8s.deployment.name     | The name of the Deployment.                                                                   | Key: `SEMRESATTRS_K8S_DEPLOYMENT_NAME`    |
| k8s.namespace.name      | The name of the namespace that the pod is running in.                                         | Key: `SEMRESATTRS_K8S_NAMESPACE_NAME`     |
| k8s.pod.name            | The name of the Pod.                                                                          | Key: `SEMRESATTRS_K8S_POD_NAME`           |
| process.command         | The command used to launch the process (i.e. the command name).                               | Key: `SEMRESATTRS_PROCESS_COMMAND`        |
| process.command_line    | The full command used to launch the process as a single string representing the full command. | Key: `SEMRESATTRS_PROCESS_COMMAND_LINE`   |
| process.executable.name | The name of the process executable.                                                           | Key: `SEMRESATTRS_PROCESS_EXECUTABLE_NAME`|
| process.pid             | Process identifier (PID).                                                                     | Key: `SEMRESATTRS_PROCESS_PID`            |
| service.instance.id     | The string ID of the service instance.                                                        | Key: `SEMRESATTRS_SERVICE_INSTANCE_ID`    |
| service.name            | Logical name of the service.                                                                  | Key: `SEMRESATTRS_SERVICE_NAME`           |
| service.namespace       | A namespace for `service.name`.                                                               | Key: `SEMRESATTRS_SERVICE_NAMESPACE`      |
| service.version         | The version string of the service API or implementation.                                      | Key: `SEMRESATTRS_SERVICE_VERSION`        |
| telemetry.sdk.language  | The language of the telemetry SDK.                                                            | Key: `SEMRESATTRS_TELEMETRY_SDK_LANGUAGE` |
| telemetry.sdk.name      | The name of the telemetry SDK.                                                                | Key: `SEMRESATTRS_TELEMETRY_SDK_NAME`     |
| telemetry.sdk.version   | The version string of the telemetry SDK.                                                      | Key: `SEMRESATTRS_TELEMETRY_SDK_VERSION`  |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
