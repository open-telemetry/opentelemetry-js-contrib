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
{"name":"myapp","hostname":"amachine.local","pid":93017,"level":20,"msg":"hi","time":"2023-09-27T23:24:06.074Z","v":0}
{
  timestamp: 1695857046074000,
  traceId: undefined,
  spanId: undefined,
  traceFlags: undefined,
  severityText: 'debug',
  severityNumber: 5,
  body: 'hi',
  attributes: { name: 'myapp', foo: 'bar' }
}
{"name":"myapp","hostname":"amachine.local","pid":93017,"level":30,"msg":"this record will have trace_id et al fields for the current span","time":"2023-09-27T23:24:06.079Z","v":0,"trace_id":"af5ce23816c4feabb713ee1dc84ef4d3","span_id":"5f50e181ec7bc621","trace_flags":"01"}
{
  timestamp: 1695857046079000,
  traceId: 'af5ce23816c4feabb713ee1dc84ef4d3',
  spanId: '5f50e181ec7bc621',
  traceFlags: 1,
  severityText: 'info',
  severityNumber: 9,
  body: 'this record will have trace_id et al fields for the current span',
  attributes: {
    name: 'myapp',
    trace_id: 'af5ce23816c4feabb713ee1dc84ef4d3',
    span_id: '5f50e181ec7bc621',
    trace_flags: '01'
  }
}
{
  traceId: 'af5ce23816c4feabb713ee1dc84ef4d3',
  parentId: undefined,
  traceState: undefined,
  name: 'manual-span',
  id: '5f50e181ec7bc621',
  kind: 0,
  timestamp: 1695857046079000,
  duration: 1407.196,
  attributes: {},
  status: { code: 0 },
  events: [],
  links: []
}
```

There are two separate Bunyan instrumentation functionalities. The first, called
"log injection", is that Bunyan log records emitted in the context of a tracing
span will include `trace_id` and `span_id` fields that can be used for
correlating with collected tracing data.

The second, called "logs bridging", is that a [Bunyan
stream](https://github.com/trentm/node-bunyan#streams) is automatically added
to created Loggers that will send every log record to the OpenTelemetry Logs
Bridge API. This means that if the OpenTelemetry SDK has been configured with
a Logger Provider, it will receive them. (If the OpenTelemetry SDK is not
configured for this, then the added Bunyan stream will be a no-op.)

# Resource attributes

One thing the `ConsoleLogRecordExporter` output above does not show is some
additional data that is included in exported log records: resource attributes.

Every OpenTelemetry LoggerProvider has a "resource". The OpenTelemetry SDK
provides configurable "resource detectors" that collect data that is then
included with log records. This can include "host.name" (provided by the
`HostDetector`) and "process.pid" (provided by the `ProcessDetector`) -- which
is why this instrumentation does **not** include the Bunyan "hostname" and "pid"
fields in the log record attributes.

When configured with the `HostDetector` and `ProcessDetector` (as shown in
"telemetry.js") the log records above also include resource attributes such
as the following:

```js
{
  'process.pid': 93017,
  'process.executable.name': 'node',
  'process.executable.path': '/Users/trentm/.nvm/versions/node/v18.18.2/bin/node',
  'process.command_args': [
    '/Users/trentm/.nvm/versions/node/v18.18.2/bin/node',
    '-r',
    './telemetry.js',
    '/Users/trentm/src/opentelemetry-js-contrib/plugins/node/opentelemetry-instrumentation-bunyan/examples/app.js'
  ],
  'process.runtime.version': '18.18.2',
  'process.runtime.name': 'nodejs',
  'process.runtime.description': 'Node.js',
  'process.command': '/Users/trentm/src/opentelemetry-js-contrib/plugins/node/opentelemetry-instrumentation-bunyan/examples/app.js',
  'process.owner': 'trentm'
  'host.name': 'amachine.local',
  'host.arch': 'amd64',
  'host.id': '...'
}
```
