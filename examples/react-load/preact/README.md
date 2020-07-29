# Overview

The React Load plugin provides auto-instrumentation for react lifecycle methods. 
This example uses the plugin and exports them to the console.

The example will show traces belong to the mounting, updating, and umounting flows as defined by React 16.4+. In this example we can show how this plugin can also be used in a Preact app.

# Installation
```
# from this directory
npm install
```

# Run the example
```
# from this directory
npm run build
npm start
```

By default, the application runs on port 8080.


## Screenshots of traces
Take note of the parent-child relationships.
### First load
Upon loading, http://localhost:8080 mounting spans will be exported
<p align="center"><img src="./images/mounting.png?raw=true"/></p>

### Pressing 'Enter'
Here we can see the previous component unmounting and the new component mounting.
<p align="center"><img src="./images/redirect.png?raw=true"/></p>

### Pressing 'Make Request'
While in loading state:
<p align="center"><img src="./images/updating.png?raw=true"/></p>

After a few seconds (when the request is fulfilled):
<p align="center"><img src="./images/updating2.png?raw=true"/></p>


# Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-node>

# LICENSE

Apache License 2.0
