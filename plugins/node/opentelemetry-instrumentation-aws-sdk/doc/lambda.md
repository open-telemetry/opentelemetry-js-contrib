# Lambda

Lambda is Amazon's function-as-a-service (FaaS) platform. Thus, it should follow the [OpenTelemetry specification for FaaS systems](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions/faas.md).

## Specific trace semantics

The following methods are automatically enhanced:

### invoke

- [Outgoing Attributes](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/semantic_conventions/faas.md#outgoing-invocations) are added by this instrumentation according to the spec.
- OpenTelemetry trace context is injected into the `ClientContext` parameter, allowing functions to extract this using the `Custom` property within the function.
