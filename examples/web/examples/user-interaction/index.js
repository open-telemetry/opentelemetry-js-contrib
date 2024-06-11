import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const providerWithZone = new WebTracerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'web-service-ui',
  }),
});

providerWithZone.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
providerWithZone.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));

providerWithZone.register({
  contextManager: new ZoneContextManager(),
  propagator: new B3Propagator(),
});

registerInstrumentations({
  instrumentations: [
    new UserInteractionInstrumentation(),
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/localhost/],
      propagateTraceHeaderCorsUrls: [
        'http://localhost:8090',
      ],
    }),
  ],
  tracerProvider: providerWithZone,
});

let lastButtonId = 0;

function btnAddClick() {
  lastButtonId++;
  const btn = document.createElement('button');
  // for easier testing of element xpath
  let navigate = false;
  if (lastButtonId % 2 === 0) {
    btn.setAttribute('id', `button${lastButtonId}`);
    navigate = true;
  }
  btn.setAttribute('class', `buttonClass${lastButtonId}`);
  btn.append(document.createTextNode(`Click ${lastButtonId}`));
  btn.addEventListener('click', onClick.bind(this, navigate));
  document.querySelector('#buttons').append(btn);
}

function prepareClickEvents() {
  for (let i = 0; i < 5; i++) {
    btnAddClick();
  }
  const btnAdd = document.getElementById('btnAdd');
  btnAdd.addEventListener('click', btnAddClick);
}

function onClick(navigate) {
  if (navigate) {
    history.pushState({ test: 'testing' }, '', `${location.pathname}`);
    history.pushState({ test: 'testing' }, '', `${location.pathname}#foo=bar1`);
  }
  getData('https://httpbin.org/get?a=1').then(() => {
    getData('https://httpbin.org/get?a=1').then(() => {
      console.log('data downloaded 2');
    });
    getData('https://httpbin.org/get?a=1').then(() => {
      console.log('data downloaded 3');
    });
    console.log('data downloaded 1');
  });
}

function getData(url, resolve) {
  return new Promise(async (resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.setRequestHeader('Accept', 'application/json');
    req.send();
    req.onload = function () {
      resolve();
    };
  });
}

window.addEventListener('load', prepareClickEvents);
