This is a small example app, "app.js", that shows using the
[Bunyan](https://github.com/trentm/node-bunyan) logger with OpenTelemetry. See
[the OpenTelemetry Bunyan instrumentation README](../) for full details.

# Usage

```bash
npm install
node -r ./telemetry.js app.js
```

# Overview

"telemetry.js" sets up the OpenTelemetry SDK to write OTel tracing spans and
log records to the *console* for simplicity. In a real setup you would
configure exporters to send to remote observability apps for viewing and
analysis.

An example run looks like this:

```bash
$ node -r ./telemetry.js app.js
{"name":"myapp","hostname":"mymachine.local","pid":88561,"level":20,"foo":"bar","msg":"hi","time":"2026-09-24T19:34:55.284Z","v":0}
{
  resource: {
    attributes: {
      'service.name': 'bunyan-example',
      'host.name': 'mymachine.local',
      'host.arch': 'arm64',
      'host.id': '...'
      'process.pid': 88561,
      'process.executable.name': 'node',
      'process.executable.path': '/Users/bob/.nvm/versions/node/v24.20.0/bin/node',
      'process.command_args': [
        '/Users/bob/.nvm/versions/node/v24.20.0/bin/node',
        '-r',
        './telemetry.js',
        '/Users/bob/src/opentelemetry-js-contrib/examples/bunyan/app.js'
      ],
      'process.runtime.version': '24.20.0',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': '/Users/bob/src/opentelemetry-js-contrib/examples/bunyan/app.js',
      'process.owner': 'bob',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '2.11.0'
    }
  },
  instrumentationScope: {
    name: '@opentelemetry/instrumentation-bunyan',
    version: '0.67.0',
    schemaUrl: undefined
  },
  timestamp: 1790278495284000,
  traceId: undefined,
  spanId: undefined,
  traceFlags: undefined,
  severityText: 'debug',
  severityNumber: 5,
  eventName: undefined,
  body: 'hi',
  attributes: { name: 'myapp', foo: 'bar' }
}

{"name":"myapp","hostname":"mymachine.local","pid":88561,"level":30,"msg":"this record will have trace_id et al fields for the current span","time":"2026-09-24T19:34:55.286Z","v":0,"trace_id":"99fce6a1282980264ba243f469863814","span_id":"6bbaed70a29905b6","trace_flags":"01"}
{
  resource: {
    attributes: { ... }
  },
  instrumentationScope: {
    name: '@opentelemetry/instrumentation-bunyan',
    version: '0.67.0',
    schemaUrl: undefined
  },
  timestamp: 1790278495286000,
  traceId: '99fce6a1282980264ba243f469863814',
  spanId: '6bbaed70a29905b6',
  traceFlags: 1,
  severityText: 'info',
  severityNumber: 9,
  eventName: undefined,
  body: 'this record will have trace_id et al fields for the current span',
  attributes: { name: 'myapp' }
}
{
  resource: {
    attributes: { ... }
  },
  instrumentationScope: { name: 'example', version: undefined, schemaUrl: undefined },
  traceId: '99fce6a1282980264ba243f469863814',
  parentSpanContext: undefined,
  traceState: undefined,
  name: 'manual-span',
  id: '6bbaed70a29905b6',
  kind: 0,
  timestamp: 1790278495286000,
  duration: 198.334,
  attributes: {},
  status: { code: 0 },
  events: [],
  links: []
}
```

There are two separate Bunyan instrumentation features. The first, called "log
correlation", is that Bunyan log records emitted in the context of a tracing
span will include `trace_id` and `span_id` fields that can be used for
correlating with collected tracing data.

The second, called "log sending", is that a [Bunyan
stream](https://github.com/trentm/node-bunyan#streams) is automatically added
to created Loggers that will send every log record to the OpenTelemetry Logs
SDK. This means that if the OpenTelemetry SDK has been configured with a Logger
Provider, it will receive them. (If the OpenTelemetry SDK is not configured for
this, then the added Bunyan stream will be a no-op.)

# Resource attributes

Every OpenTelemetry LoggerProvider has a "resource". The OpenTelemetry SDK
provides configurable "resource detectors" that collect data that is then
included with log records. This can include "host.name" (provided by the
`HostDetector`) and "process.pid" (provided by the `ProcessDetector`).
`instrumentation-bunyan` drops the Bunyan "hostname" and "pid" fields from
OTel Log Records to avoid duplication.
