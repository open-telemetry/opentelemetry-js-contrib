# Validation Demo

This demo provides a quick way to verify that OpenTelemetry trace data can be
generated and exported from this repository.

The default trace base endpoint is `http://localhost:9529/otel`.
The effective trace export endpoint becomes
`http://localhost:9529/otel/v1/traces`.

This demo uses OTLP HTTP/protobuf by default.

## Install

```bash
cd examples/validation-demo
npm install
```

## Option 1: Send directly to your receiver

If your receiver is a local DataKit instance, run:

```bash
npm run demo
```

The script will:

- start a local Express service
- issue a self-request to generate HTTP client/server spans
- create an additional manual `validation.business` span
- print spans to the console for side-by-side comparison with receiver output

## Option 2: Verify the outgoing request with a local receiver

Start the local receiver first:

```bash
npm run receiver
```

Then run the demo:

```bash
npm run demo
```

The receiver terminal will show the request path, `content-type`, payload
length, and a hex preview of the first bytes.

## Optional environment variables

```bash
OTEL_SERVICE_NAME=my-validation-demo npm run demo
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:9529/otel npm run demo
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:9529/otel/v1/traces npm run demo
DEMO_PORT=8099 npm run demo
RECEIVER_PORT=9529 npm run receiver
```

## DataKit path notes

DataKit's OTLP trace HTTP receiver path should use `/otel/v1/traces`.
If you want to configure a base endpoint instead of the full signal path, use
`OTEL_EXPORTER_OTLP_ENDPOINT`, for example `http://localhost:9529/otel`.

To override the full signal endpoint directly, set
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`:

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:9529/otel/v1/traces npm run demo
```
