import { context, getSpan, setSpan } from '@opentelemetry/api';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { CompositePropagator, HttpTraceContext } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new WebTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.addSpanProcessor(new SimpleSpanProcessor(new CollectorTraceExporter()));

provider.register({
  contextManager: new ZoneContextManager(),
  propagator: new CompositePropagator({
    propagators: [
      new B3Propagator(),
      new HttpTraceContext(),
    ],
  }),
});
registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/localhost/],
      propagateTraceHeaderCorsUrls: [
        'http://localhost:8090',
      ],
    }),
  ],
  tracerProvider: provider,
});

const tracer = provider.getTracer('example-document-load');

const getData = (url) => new Promise((resolve, reject) => {
  // eslint-disable-next-line no-undef
  const req = new XMLHttpRequest();
  req.open('GET', url, true);
  req.send();
  req.onload = () => {
    let json;
    try {
      json = JSON.parse(req.responseText);
    } catch (e) {
      reject(e);
    }
    resolve(json);
  };
});

// example of keeping track of context between async operations
const prepareClickEvent = () => {
  const url1 = 'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/master/package.json';
  const url2 = 'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/master/packages/opentelemetry-web/package.json';

  const element = document.getElementById('button1');

  const onClick = () => {
    let count = 0;

    function finish() {
      count++;
      if (count === 2) {
        mainSpan.end();
      }
    }

    const mainSpan = tracer.startSpan('click button');
    context.with(setSpan(context.active(), mainSpan), () => {
      const span1 = tracer.startSpan('files-series-info-1');

      const span2 = tracer.startSpan('files-series-info-2');

      context.with(setSpan(context.active(), span1), () => {
        getData(url1).then((data) => {
          const curSpan = getSpan(context.active());
          console.log('current span is span1', curSpan === span1);
          console.log('info from package.json', data.description, data.version);
          curSpan.addEvent('fetching-span1-completed');
          span1.end();
          finish();
        });
      });

      context.with(setSpan(context.active(), span2), () => {
        getData(url2).then((data) => {
          setTimeout(() => {
            const curSpan = getSpan(context.active());
            console.log('current span is span2', curSpan === span2);
            console.log('info from package.json', data.description, data.version);
            curSpan.addEvent('fetching-span2-completed');
            span2.end();
            finish();
          }, 100);
        });
      });
    });
  };
  element.addEventListener('click', onClick);
};

window.addEventListener('load', prepareClickEvent);
