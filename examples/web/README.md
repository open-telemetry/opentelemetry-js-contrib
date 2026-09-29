# Overview

This example shows how to use tracing in a browser application, using various instrumentations from this repo.

## Installation

```sh
# from this directory
npm install
```

## Start a collector and trace viewer

Optionally, you can use the provided Docker Compose file to start an OpenTelemetry Collector and a Zipkin to view collected traces.
You can skip this step if you have your own collector already setup.

```sh
npm run docker:start
```

## Run the Application

```sh
# from this directory
npm start
```

- Open the application at <http://localhost:8090>.
- Click around in each of the example sub-paths to create some tracing data.
- Open Zipkin at <http://127.0.0.1:9411/zipkin/> and search for some traces (click "Run Query").

## License

Apache License 2.0
