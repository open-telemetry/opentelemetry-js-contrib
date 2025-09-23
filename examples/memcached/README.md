# Overview

OpenTelemetry Memcached instrumentation allows user to automatically collect trace data from queries made by the client and export them to the backend of choice. This example does not showcase export functionality, but there are numerous other examples doing that: [`express`](../express), [`router`](../router).

## Running the Example

Created spans are printed out to stdout while running the example.

```sh
npm install # install the dependencies
npm run docker:start # start memcached server
npm run start # run the example
npm run docker:stop # spin down and clean up the docker container
```

## LICENSE

Apache License 2.0
