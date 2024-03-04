This is a small example app, "app.js", that shows using the
[Undici](https://github.com/nodejs/undici) instrumentation with OpenTelemetry.

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

```
