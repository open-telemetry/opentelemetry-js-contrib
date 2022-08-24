# Documentation

> OpenTelemetry Library for Fastly Compute@Edge (JavaScript)

## OpenTelemetry

OpenTelemetry provides a single set of APIs, libraries, agents, and collector services to capture distributed traces and metrics from your application. You can analyze them using Prometheus, Jaeger, and other observability tools.

## Getting Started: Adding the library/module to your application and init tracing

To start using OpenTelemetry intrumentation, add the library to your Fastly Compute@Edge service project.

```javascript
const Tracer = require('opentelemetry-fastly-ce-instrumentation-lib');
const tracer = new Tracer();
```

## Wrap the request handler function

The primary method in the module is the wrapper that enables the tracing in your service and create a main span for your application.

Adding the event listener to the incoming request, the fetch event, and passing the request details to your function to handle the request normally looks per below.

```javascript
addEventListener('fetch', event => event.respondWith(handleRequest(event)));
```

To add the wrapper, simple use ther wrapper method with your function and the event details as arguments.

```javascript
addEventListener('fetch', event => event.respondWith(tracer.wrapper(handleRequest, event)));
```

This will create an intial span for your code. It will also auto-instrument the `fetch` function if you are requesting external resources from your code and add resource attributes related to the Fastly runtime executing your code.

* **fastly.hostname** - The Fastly server executing your code (e.g. cache-bma1631).
* **fastly.service.id** - The id of your Compute@Edge service (e.g. 7YyyUxZXAFTZIp8Q9QSOK).
* **fastly.service.version** - The version of your Compute@Edge service (e.g. 102).

## Configure the Open Telemetry Collector Backend

To allow your trace details to be exported you need to configure a OpenTelemetry Collector in your tracer. This is done with the methods `setOtelCollectorUrl`, `setOtelCollectorBackend` and `setOtelCollectorUserCredentials` for the tracer object. The value set with `setOtelCollectorUserCredentials` is the base64 encoded string of username and password (username:password). That value will be used with basic authentication with the OpenTelemetry Collector ("Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ="). See example below.

```javascript
tracer.setOtelCollectorUrl("https://my.otelcollector.net/v1/traces");
tracer.setOtelCollectorBackend("otel_collector_backend");
tracer.setOtelCollectorUserCredentials("bzExeTpvMTF5");  // the string o11y:o11y base64 encoded
```

The Fastly backend for the service can be configured using the Fastly CLI.

```shell
fastly backend create --version=latest --name=otel_collector_backend --address=my.otelcollector.net --service-id={your-fastly-service-id} --autoclone
```

## Working with Spans

New spans are created using the `startSpan` method of the tracer object. The method support two attributes, the first is a the name of the span (string) and the second is an optional object supporting configuration of three different span attrinbutes: `kind`, `parentSpanId` and `allowAsParent`. The `kind` and `parentSpanId` attributes are per the OpenTelemetry span attributes while `allowAsParent` has been added to control if a span automatically should be a parent to the next created span or not. The `allowAsParent` is used for the auto-generated `fetch` spans but may be used for other operations as well. A new span can be created per below. In this case we specify the span kind (2) and prevent it from automatically being a parent to our next span.

```javascript
let myNewSpan = tracer.startSpan("my span name", { kind: 2, allowAsParent: false });
```

If the second argument is left out the kind will be set to 1, it will be allowed to automatically be a parent and the current active span will be the parent of our created span.

```javascript
let myNewSpan = tracer.startSpan("my span name");
```

### Set span kind

In addition to defining the span kind when the span is created you can change it using the method `setKind` for the span object.

```javascript
myNewSpan.setKind(2);
```

### Set span status

To change the status of a span use the method `setStatus` of the span object.

```javascript
myNewSpan.setStatus(2);
```

### Get span id (span)

To get the span id of a span use the method `getSpanId` of the span object. The method returns a string that contains the span id.

```javascript
let spanId = myNewSpan.getSpanId();
```

### Get span object by id

To get the span object by id use the method `getSpanById` of the tracer object. The method returns the span object with the requested span id. Getting the span object allows to add and modify properties of the span.

```javascript
let mySpan = tracer.getSpanById(myFetchResponse.spanId);
mySpan.setAttribute("myAttributeKey", "myAttributeValue");
```

### Get parent span context

The parent span context of a span can be retrieved by using the `getParentSpanContext` method of the span object. A span context is an object contatining a unique identifier for the span (also containing the trace id).

```javascript
let mySpanContext = myNewSpan.getParentSpanContext();
```

### Update name of span

The name of a span, including the main span, can be updated using the `updateName` method of the span object.

```javascript
myNewSpan.updateName("my new span name");
```

To update the main span the span object has to be retrived. This is done with a help of the getCurrentSpan method of the tracer object.

```javascript
tracer.getCurrentSpan().updateName("C@E-Main-New Span Name");
```

### Set span attribute

Attributes are added to a span with key value pairs using the `setAttribute` method of the span object. Current implementation supports strings and numeric values.

```javascript
myNewSpan.setAttribute("result", "information");
```

### Get span details

All details of a span can be retrived using the `getSpanDetails` method of the span object. The details are returned as an object.
Attributes are added to a span with key value pairs using the `setAttribute` method of the span object. Current implementation supports strings and numeric values.

```javascript
myNewSpan.getSpanDetails();
```

## The Tracer Object

### Add properties to logs (json)

In addition to adding attributes, and other information, to the traces it's also important to be able to correlate traces and logs. The library contains a wrapper for the Logger in the Fastly C@E to automatically add trace details to the logs. Currently it only supports logs as objects, designed for Splunk HEC format. This is done by using the logWrapper method of the Fastly logger object.

```javascript
const logger = fastly.getLogger("my-splunk-hec-logger");
let myLogMessage = {
    "event": {
        "message": "Log message from the Edge",
    },
    "sourcetype": "fastly-compute@edge"
};
logger.log(JSON.stringify(myLogMessage));
tracer.logWrapper(logger);
logger.log(JSON.stringify(myLogMessage));
```

In the example above the first logger.log call with log the object as defined (myLogMessage). The second logger.log call, run after the logWrapper method, will also contain a properties object with traceid, spanid, companyName and systemName details.

```javascript
// first log message
 {"event":{"message":"Log message from the Edge"},"sourcetype":"fastly-compute@edge"}
// second log message
{"event":{"message":"Log message from the Edge","properties":{"trace_id":"772ebb50c9798b55a4368da9cbb09adf","span_id":"6e9e3d93a34962a1","trace_flags":"00"}},"sourcetype":"fastly-compute@edge"}
```

### Set resource attributes

Resource attributes for the trace can be set using the `setResourceAttribute` method of the tracer object.

```javascript
tracer.setResourceAttribute("my.attributes.first", "important info");
tracer.setResourceAttribute("my.attributes.second", 1234);
```

### Get trace id

The trace id can be retrived as a string using the method `getTraceId` of the tracer object.

```javascript
let traceId = tracer.getTraceId();
```

### Get span id (trace)

The current span id can be retrived as a string using the method `getCurrentSpanId` of the tracer object.

```javascript
let spanId = tracer.getCurrentSpanId();
```

### Get span object

The current span object can be retrived using the method `getCurrentSpan` of the tracer object.

```javascript
let myCurrentSpan = tracer.getCurrentSpan();
```

### Get the name of the current span

The name of the current span can be retrived as a string using the `getCurrentSpanName` method of the tracer object.

```javascript
let spanName = tracer.getCurrentSpanName();
```

### Configure output of trace (json) to stdout

By default the object that contain all details of the trace that has been generated in the Fastly Compute@Edge service is not output to the stdout, and part of log tailing. By using the method `outputTracetoStdOut` this can be achieved. The argument for the method is a boolean.

```javascript
tracer.outputTracetoStdOut(true);
```

### Get current trace output

For debugging and testing purposed it's possible to output the current trace data or, once the Compute@Edge function is complete, the data that will be sent to the OpenTelemetry Collector or to stdout once the Compute@Edge function is complete.

```javascript
let myTrace = tracer.getOtlpOutput();
```

## Examples

Examples, where local instances of Fastly Compute@Edge is run with the OpenTelemetry library, can be found in the [examples section](../examples/README.md).
