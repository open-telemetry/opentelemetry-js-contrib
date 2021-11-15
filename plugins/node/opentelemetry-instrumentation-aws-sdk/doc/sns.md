# SNS

SNS is amazon's managed pub/sub system. Thus, it should follow the [OpenTelemetry specification for Messaging systems](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md).

## Specific trace semantic

The following methods are automatically enhanced:

### Publish messages

- [Messaging Attributes](https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#messaging-attributes) are added by this instrumentation according to the spec.
- OpenTelemetry trace context is injected as SNS MessageAttributes, so the service receiving the message can link cascading spans to the trace which created the message.

### Consumers

There are many potential consumers: SQS, Lambda, HTTP/S, Email, SMS, mobile notifications. each one of them will received the propagated context in its own way.
