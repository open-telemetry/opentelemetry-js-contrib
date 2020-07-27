# Overview

The React Load plugin provides auto-instrumentation for react lifecycle methods. 
This example uses the plugin and exports them to the console.

The example will show traces belong to the mounting, updating, and umounting flows as defined by React 16.4+.

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

If building the app spits out an error like:
```
There might be a problem with the project dependency tree.
It is likely not a bug in Create React App, but something you need to fix locally.

The react-scripts package provided by Create React App requires a dependency:

  "eslint": "^6.6.0"

Don't try to install it manually: your package manager does it automatically.
However, a different version of eslint was detected higher up in the tree:
...
```

then fix the dependency issue by running:
```
# from this directory
npm run clean
```

By default, the application runs on port 5000.


## Screenshots of traces
Take note of the parent-child relationships.
### First load
Upon loading, http://localhost:5000 mounting spans will be exported
<p align="center"><img src="./images/mounting.png?raw=true"/></p>

### Pressing 'Enter'
Here we can see the previous component unmounting and the new component mounting.
<p align="center"><img src="./images/redirect.png?raw=true"/></p>

### Pressing 'Make Request'
While in loading state:
<p align="center"><img src="./images/updating.png?raw=true"/></p>

After a few seconds (when the request is fulfilled):
<p align="center"><img src="./images/updating2.png?raw=true"/></p>

Since the example adds in a delay to the request, we can see that reflected in the duration of some spans:
<p align="center"><img src="./images/duration.png?raw=true"/></p>



# Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more information on OpenTelemetry for Node.js, visit: <https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-node>

# LICENSE

Apache License 2.0
