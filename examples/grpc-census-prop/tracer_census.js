'use strict';

const tracing = require('@opencensus/nodejs');
const { ConsoleExporter } = require('@opencensus/core');

const defaultBufferConfig = {
  bufferSize: 1,
  bufferTimeout: 2000,
};

/**
 * Return an OpenCensus tracer configured to use the gRPC plugin
 */
module.exports = () => {
  const { tracer } = tracing.start({

    samplingRate: 1,
    plugins: {
      grpc: '@opencensus/instrumentation-grpc',
    },
  });

  tracer.registerSpanEventListener(new ConsoleExporter(defaultBufferConfig));

  return tracer;
};
