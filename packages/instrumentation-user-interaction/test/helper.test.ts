/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as tracing from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';

export class DummySpanExporter implements tracing.SpanExporter {
  export(spans: tracing.ReadableSpan[]) {}

  shutdown() {
    return Promise.resolve();
  }
}

export function createButton(disabled?: boolean): HTMLElement {
  const button = document.createElement('button');
  button.setAttribute('id', 'testBtn');
  if (disabled) {
    button.setAttribute('disabled', 'disabled');
  }
  return button;
}

export function fakeClickInteraction(
  callback: Function = function () {},
  element: HTMLElement = createButton()
) {
  element.addEventListener('click', () => {
    callback();
  });

  element.click();
}

export function fakeEventInteraction(
  eventType: string,
  callback: Function = function () {},
  elem?: HTMLElement
) {
  const element: HTMLElement = elem || createButton();
  const event = document.createEvent('Event');
  event.initEvent(eventType, true, true);

  element.addEventListener(eventType, () => {
    callback();
  });

  element.dispatchEvent(event);
}

export function assertClickSpan(span: tracing.ReadableSpan, id = 'testBtn') {
  assertInteractionSpan(span, { name: 'click', elementId: id });
}

export function assertInteractionSpan(
  span: tracing.ReadableSpan,
  {
    name,
    eventType = name,
    elementId = 'testBtn',
  }: { name: string; eventType?: string; elementId?: string }
) {
  assert.strictEqual(span.name, name);

  const attributes = span.attributes;
  assert.strictEqual(attributes.event_type, eventType);
  assert.strictEqual(attributes.target_element, 'BUTTON');
  assert.strictEqual(attributes.target_xpath, `//*[@id="${elementId}"]`);
  assert.ok(attributes['http.url'] !== '');
  assert.ok(attributes['user_agent'] !== '');
}

export function getData(url: string, callbackAfterSend: Function) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.send();

    req.onload = resolve;
    req.onerror = reject;
    req.ontimeout = reject;

    callbackAfterSend();
  });
}
