# OTel esbuild-plugin

This is a proposal for a `diagnostics_channel`-based mechanism for bundlers
to hand off a loaded module, at runtime, to possibly active OTel
instrumentations. This is an alternative proposal to
https://github.com/open-telemetry/opentelemetry-js-contrib/pull/1856

More details in the PR.

XXX obviously I need to fill this all in


## Dev Notes

While this is all still in a development state, here is roughly how I work on this:

Get a clone of the https://github.com/open-telemetry/opentelemetry-js/pull/4818 feature branch (e.g. to `~/tm/opentelemetry-js10` in the example below).
Get a clone of the https://github.com/open-telemetry/opentelemetry-js-contrib/pull/2295 feature branch (e.g. to `~/tm/opentelemetry-js-contrib5` in the example below).

Setup the node_modules in the example in the contrib repo.

```bash
cd ~/tm/opentelemetry-js-contrib5/packages/esbuild-plugin/example   # my tm-esbuild-plugin-alternative branch
# Note: You probably want to update to a recent '@opentelemetry/auto-instrumentations-node' dep, e.g. '^0.55.2'
npm install   # get the initial layout
```

Build and copy in the changes from `@opentelemetry/instrumentation` in the core repo clone.

```bash
cd ~/tm/opentelemetry-js10/experimental/packages/opentelemetry-instrumentation   # my tm-esbuild-plugin-alternative branch
vi ...   # make whatever edits I need
npm run compile
rsync -av ~/tm/opentelemetry-js10/experimental/packages/opentelemetry-instrumentation/build/ ~/tm/opentelemetry-js-contrib5/packages/esbuild-plugin/example/node_modules/@opentelemetry/instrumentation/build/
```

Back to the opentelemetry-js-contrib clone.

```bash
cd ~/tm/opentelemetry-js-contrib5/packages/esbuild-plugin/example
```

Run services used by app.js in a separate terminal:

```bash
docker run --name redis -ti --rm -p 6379:6379 redis:7   # run redis in a terminal for app.js to use
```

To watch OTel telemetry data for dev, I personally use `mockotlpserver` (https://github.com/elastic/elastic-otel-node/tree/main/packages/mockotlpserver#readme) which I and co-workers have written at Elastic. It is a smallish Node.js app that listens on the OTLP/HTTP and gRPC default ports and dumps a text representation of the data it receives. You can use it as follows, or use whatever you are used to:

```bash
npx @elastic/mockotlpserver
```

Now, run the *unbundled* app with instrumentation to see what to expect:

```bash
export OTEL_NODE_DISABLED_INSTRUMENTATIONS=net,dns,fs # disable some distracting instrumentations
export OTEL_NODE_RESOURCE_DETECTORS=env,host,os,process,serviceinstance  # avoid cloud detectors to reduce noise
node -r @opentelemetry/auto-instrumentations-node/register app.js
```

If you get the same as me, the "mockotlpserver" summary output shows this tracing data:

```
------ trace b3fbd7 (1 span) ------
       span c0f9c8 "redis-connect" (6.2ms, SPAN_KIND_CLIENT)
------ trace a9186c (1 span) ------
       span 8666f5 "redis-SET" (0.7ms, SPAN_KIND_CLIENT)
------ trace 2f54b8 (4 spans) ------
       span 65d728 "GET" (7.7ms, SPAN_KIND_CLIENT, GET http://localhost:3000/ping -> 200)
  +3ms `- span 91109f "GET /ping" (4.4ms, SPAN_KIND_SERVER, GET http://localhost:3000/ping -> 200)
  +0ms   `- span f4aaca "request handler - fastify" (3.1ms, SPAN_KIND_INTERNAL)
  +1ms     `- span 92f5d1 "redis-GET" (1.4ms, SPAN_KIND_CLIENT)
```

Now run the *bundled* app with instrumentation and compare:

```bash
vi esbuild.mjs  # edit the `otelPlugin` function
npm run build   # build the bundle (in build/app.js)
node -r @opentelemetry/auto-instrumentations-node/register build/app.js
```

Verify that the bundle isn't using `node_modules/{redis,fastify}`:

```bash
rm -rf node_modules/fastify node_modules/redis
node -r @opentelemetry/auto-instrumentations-node/register build/app.js
```
