'use strict';

const tracing = require('@opencensus/nodejs');
const { ConsoleExporter } = require('@opencensus/core');

const defaultBufferConfig = {
  bufferSize: 1,
  bufferTimeout: 2000
};

module.exports = () => {
  let tracer = tracing.start({

    samplingRate: 1,
    plugins: {
      'grpc': '@opencensus/instrumentation-grpc'
    }
  }).tracer;

  tracer.registerSpanEventListener(new ConsoleExporter(defaultBufferConfig));

  return tracer;
};
