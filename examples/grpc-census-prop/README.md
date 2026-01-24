# Introduction

This example uses the same gRPC [defs.proto](./protos/defs.proto) as the
[grpc_dynamic_codegen](../grpc_dynamic_codegen)
example in which a server takes a payload containing bytes and capitalizes them.
In this case we are demonstrating the use of the
[propagator-grpc-census-binary](../../propagators/opentelemetry-propagator-grpc-census-binary)
propagator. The propagator can be useful when communicating with another service
that is already instrumented using OpenCensus.

If both sides of gRPC communication are using OpenTelemetry instrumentation then
the `propagator-grpc-census-binary` propagator isn't required. Context will be
propagated using the `traceparent` header (thanks to the
[HttpTraceContextPropagator](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/src/trace/W3CTraceContextPropagator.ts)
propagator from opentelemetry-core). If there is a mix of OpenCensus and OpenTelemetry
instrumentation then the `propagator-grpc-census-binary` propagator allows OpenTelemetry
to propagate context through the `grpc-trace-bin` binary header.

The same source code is used to run various versions of the client and server. Environment
variables (set up through `scripts` in [package.json](./package.json)) determine the various
combinations. This table shows what to expect:

| Combination | Client Instrumentation | Server Instrumentation | Propagation Header |
| :---------- | :--------------------- | :--------------------- | :----------------- |
| 1           | OpenTelemetry (default propagator) | OpenTelemetry (default propagator)  | `traceparent` |
| 2           | OpenCensus | OpenTelemetry (**binary propagator**) | `grpc-trace-bin` |
| 3           | OpenCensus | OpenCensus | `grpc-trace-bin` |
| 4           | OpenTelemetry (**binary propagator**) | OpenCensus  | `grpc-trace-bin` |

If context propagation is working correctly we should see consistent values
for `traceId` in the output of both the client and server. (Note: the example
uses simple Console Exporters rather than Jaeger or Zipkin). The servers also
output the contents of `grpc.Metadata` which allows us to see the values of
`traceparent` or `grpc-trace-bin` where applicable.

## Installation

```sh
# from this directory
npm install
```

## Running the Client and Server combinations

### Combination 1

OpenTelemetry (with default propagator) used on both client and server.
Propagation through `traceparent` header.

- Run the server

   ```sh
   # from this directory
   npm run server:otel:defprop
   ```

- Run the client

   ```sh
   # from this directory
   npm run client:otel:defprop
   ```

### Combination 2

OpenTelemetry (with **binary propagator**) used on server, OpenCensus used
on client. Propagation through `grpc-trace-bin` header.

- Run the server

   ```sh
   # from this directory
   npm run server:otel:binprop
   ```

- Run the client

   ```sh
   # from this directory
   npm run client:census
   ```

See [combination2](./combination2.md) for example output

### Combination 3

OpenCensus used on both client and server. Propagation through `grpc-trace-bin` header.

- Run the server

   ```sh
   # from this directory
   npm run server:census
   ```

- Run the client

   ```sh
   # from this directory
   npm run client:census
   ```

### Combination 4

OpenCensus used on server, OpenTelemetry (with **binary propagator**) used on
client. Propagation through `grpc-trace-bin` header.

- Run the server

   ```sh
   # from this directory
   npm run server:census
   ```

- Run the client

   ```sh
   # from this directory
   npm run client:otel:binprop
   ```

See [combination4](./combination4.md) for example output

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node-sdk>

## LICENSE

Apache License 2.0
