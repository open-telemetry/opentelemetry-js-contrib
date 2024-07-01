# OpenTelemetry BullMQ Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

**Note: This is an experimental package under active development. New releases may include breaking changes.**

This module provides automatic instrumentation for the [BullMQ](https://bullmq.io) Node.js package (`bullmq`).

## Installation

```bash
npm install --save @opentelemetry/instrumentation-bullmq
```

## Supported Versions

- `bullmq@>=2`

## Usage

The OpenTelemetry BullMQ instrumentation automatically instruments the usage of BullMQ in the application, collecting trace data when jobs are enqueued and when they are processed.

To load the instrumentation, specify it as part of your OpenTelemetry setup configuration. For example, using `registerInstrumentations`:

```js
const {
  BullMQInstrumentation,
} = require('@opentelemetry/instrumentation-bullmq');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

registerInstrumentations({
  instrumentations: [new BullMQInstrumentation({
    // instrumentation options, see below
  })],
});
```


### Configuration options

| Name                          | Type      | Default&nbsp;value | Description                                                                                                                                                                                                  |
| ----------------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `emitCreateSpansForBulk`      | `boolean` | `true`             | Whether to emit a create span for each individual job enqueued by `Queue.addBulk` or `FlowProducer.addBulk`. The span representing the overall bulk operation is emitted regardless.                         |
| `emitCreateSpansForFlow`      | `boolean` | `true`             | Whether to emit a create span for each individual job enqueued by `FlowProducer.add` or `FlowProducer.addBulk`. The span representing the overall flow operation is emitted regardless.                      |
| `requireParentSpanForPublish` | `boolean` | `false`            | Whether to omit emitting a publish span (and the create child spans for it, for bulk and flow operations) when there is no parent span, meaning that the span created would be the root span of a new trace. |

### Emitted spans

The instrumentation aims to comply with the [OpenTelemetry Semantic Convention for Messaging Spans](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/). Whenever possible, attributes from the semantic convention are used in these spans.

| Name                  | Span kind                                                                                                                      | `messaging.bullmq.operation.name` attribute&nbsp;<a href="#emitted-spans-note-1"><sup>\[1\]</sup></a> | Description                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{queueName} publish` | `PRODUCER`                                                                                                                     | `Queue.add`                                                                                           | A new job is added to the queue.                                                                                                                                               |
| `{queueName} publish` | `INTERNAL`&nbsp;<a href="#emitted-spans-note-2"><sup>\[2\]</sup></a>                                                           | `Queue.addBulk`                                                                                       | New jobs are added to the queue in bulk.                                                                                                                                       |
| `{queueName} publish` | `INTERNAL`&nbsp;<a href="#emitted-spans-note-3"><sup>\[3\]</sup></a>                                                           | `FlowProducer.add`                                                                                    | A new job flow is added to a queue.                                                                                                                                            |
| `(bulk) publish`      | `INTERNAL`&nbsp;<a href="#emitted-spans-note-2"><sup>\[2\]</sup></a>&nbsp;<a href="#emitted-spans-note-3"><sup>\[3\]</sup></a> | `FlowProducer.addBulk`                                                                                | New job flows are added to queues in bulk.                                                                                                                                     |
| `{queueName} create`  | `PRODUCER`                                                                                                                     | `Job.add`                                                                                             | Each of the individual jobs added to a queue. Only emitted in bulk or flow operations. Child span of a publish span.&nbsp;<a href="#emitted-spans-note-4"><sup>\[4\]</sup></a> |
| `{queueName} process` | `CONSUMER`                                                                                                                     | `Worker.run`                                                                                          | Each job execution by a worker. Linked to the corresponding producer span.&nbsp;<a href="#emitted-spans-note-5"><sup>\[5\]</sup></a>                                           |

- <a name="emitted-spans-note-1">**\[1\]**</a>: Represents the BullMQ function that was called in the application in order to trigger this span to be emitted.
- <a name="emitted-spans-note-2">**\[2\]**</a>: When the `emitCreateSpansForBulk` configuration option is set to `false`, it is a `PRODUCER` span.
- <a name="emitted-spans-note-3">**\[3\]**</a>: When the `emitCreateSpansForFlow` configuration option is set to `false`, it is a `PRODUCER` span.
- <a name="emitted-spans-note-4">**\[4\]**</a>: Will not be emitted for calls to `Queue.addBulk` and `FlowProducer.addBulk` when the `emitCreateSpansForBulk` configuration option is `false`, or for calls to `FlowProducer.add` and `FlowProducer.addBulk` when the `emitCreateSpansForFlow` configuration option is set to `false`.
- <a name="emitted-spans-note-5">**\[5\]**</a>: The producer span may not have been emitted if the `requireParentSpanForPublish` is set to `true`. In this case, no link is established.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## Acknowledgments

This instrumentation was forked from [`@jenniferplusplus/opentelemetry-instrumentation-bullmq`](https://github.com/jenniferplusplus/opentelemetry-instrumentation-bullmq).

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-bullmq
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-bullmq.svg
