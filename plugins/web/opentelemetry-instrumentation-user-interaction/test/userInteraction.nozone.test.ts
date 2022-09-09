/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const originalSetTimeout = window.setTimeout;

import { trace } from '@opentelemetry/api';
import { isWrapped } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import * as tracing from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { UserInteractionInstrumentation } from '../src';
import { UserInteractionInstrumentationConfig } from '../src/types';
import {
  assertClickSpan,
  assertInteractionSpan,
  createButton,
  DummySpanExporter,
  fakeClickInteraction,
  fakeEventInteraction,
  getData,
} from './helper.test';

const FILE_URL =
  'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json';

describe('UserInteractionInstrumentation', () => {
  describe('when zone.js is NOT available', () => {
    let userInteractionInstrumentation: UserInteractionInstrumentation;
    let sandbox: sinon.SinonSandbox;
    let webTracerProvider: WebTracerProvider;
    let dummySpanExporter: DummySpanExporter;
    let exportSpy: sinon.SinonSpy;
    let requests: sinon.SinonFakeXMLHttpRequest[] = [];

    const registerTestInstrumentations = (
      config?: UserInteractionInstrumentationConfig
    ) => {
      userInteractionInstrumentation?.disable();

      userInteractionInstrumentation = new UserInteractionInstrumentation({
        enabled: false,
        ...config,
      });

      sandbox
        .stub(userInteractionInstrumentation, 'getZoneWithPrototype')
        .callsFake(() => {
          return false as any;
        });

      registerInstrumentations({
        tracerProvider: webTracerProvider,
        instrumentations: [
          userInteractionInstrumentation,
          new XMLHttpRequestInstrumentation(),
        ],
      });
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      const fakeXhr = sandbox.useFakeXMLHttpRequest();
      fakeXhr.onCreate = function (xhr: sinon.SinonFakeXMLHttpRequest) {
        requests.push(xhr);
        setTimeout(() => {
          requests[requests.length - 1].respond(
            200,
            { 'Content-Type': 'application/json' },
            '{"foo":"bar"}'
          );
        });
      };

      sandbox.useFakeTimers();

      webTracerProvider = new WebTracerProvider();

      dummySpanExporter = new DummySpanExporter();
      exportSpy = sandbox.stub(dummySpanExporter, 'export');
      webTracerProvider.addSpanProcessor(
        new tracing.SimpleSpanProcessor(dummySpanExporter)
      );
      webTracerProvider.register();

      registerTestInstrumentations();

      // this is needed as window is treated as context and karma is adding
      // context which is then detected as spanContext
      (window as { context?: {} }).context = undefined;
    });

    afterEach(() => {
      requests = [];
      sandbox.restore();
      exportSpy.restore();
      trace.disable();
      userInteractionInstrumentation.disable();
    });

    it('should not break removeEventListener', () => {
      let called = false;
      const listener = function () {
        called = true;
      };
      // add same listener three different ways
      document.body.addEventListener('bodyEvent', listener);
      document.body.addEventListener('bodyEvent2', listener);
      document.addEventListener('docEvent', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(called, true);
      called = false;
      // Remove first callback, second type should still fire
      document.body.removeEventListener('bodyEvent', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(called, false);
      document.body.dispatchEvent(new Event('bodyEvent2'));
      assert.strictEqual(called, true);
      called = false;
      // Remove doc callback, body 2 should still fire
      document.removeEventListener('docEvent', listener);
      document.dispatchEvent(new Event('docEvent'));
      assert.strictEqual(called, false);
      document.body.dispatchEvent(new Event('bodyEvent2'));
      assert.strictEqual(called, true);
      called = false;
      // Finally, remove the last one and nothing should fire
      document.body.removeEventListener('bodyEvent2', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      document.body.dispatchEvent(new Event('bodyEvent2'));
      document.dispatchEvent(new Event('docEvent'));
      assert.strictEqual(called, false);
    });

    it('should not double-register a listener', () => {
      let callCount = 0;
      const listener = function () {
        callCount++;
      };
      // addEventListener semantics treat the second call as a no-op
      document.body.addEventListener('bodyEvent', listener);
      document.body.addEventListener('bodyEvent', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 1);
      // now ensure remove still works
      callCount = 0;
      document.body.removeEventListener('bodyEvent', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 0);
    });

    it('should handle once-only callbacks', () => {
      let callCount = 0;
      const listener = function () {
        callCount++;
      };
      // addEventListener semantics treat the second call as a no-op
      document.body.addEventListener('bodyEvent', listener, { once: true });
      document.body.addEventListener('bodyEvent', listener); // considered a double-register
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 1);
      // now that it's been dispatched once, it's been removed
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 1);
      // should be able to re-add
      document.body.addEventListener('bodyEvent', listener);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 2);
      document.body.dispatchEvent(new Event('bodyEvent'));
      assert.strictEqual(callCount, 3);
    });

    it('should handle EventListener callbacks', () => {
      let callCount = 0;
      const listener = {
        handleEvent(evt: Event) {
          if (evt) {
            callCount++;
          }
        },
      };
      document.body.addEventListener('EventListenerEvent', listener);
      document.body.dispatchEvent(new Event('EventListenerEvent'));
      assert.strictEqual(callCount, 1);
      callCount = 0;
      document.body.removeEventListener('EventListenerEvent', listener);
      document.body.dispatchEvent(new Event('EventListenerEvent'));
      assert.strictEqual(callCount, 0);
    });

    it('should handle task without async operation', () => {
      fakeClickInteraction();
      assert.equal(exportSpy.args.length, 1, 'should export one span');
      const spanClick = exportSpy.args[0][0][0];
      assertClickSpan(spanClick);
    });

    it('should handle timeout', done => {
      fakeClickInteraction(() => {
        originalSetTimeout(() => {
          const spanClick: tracing.ReadableSpan = exportSpy.args[0][0][0];

          assert.equal(exportSpy.args.length, 1, 'should export one span');
          assertClickSpan(spanClick);
          done();
        });
      });
      sandbox.clock.tick(10);
    });

    it('should handle target without function getAttribute', done => {
      let callback: Function;
      const btn: any = {
        addEventListener: function (name: string, callbackF: Function) {
          callback = callbackF;
        },
        click: function () {
          callback();
        },
      };
      fakeClickInteraction(() => {
        originalSetTimeout(() => {
          assert.equal(exportSpy.args.length, 0, 'should NOT export any span');
          done();
        });
      }, btn);
      sandbox.clock.tick(10);
    });

    it('should not create span when element has attribute disabled', done => {
      let callback: Function;
      const btn: any = {
        addEventListener: function (name: string, callbackF: Function) {
          callback = callbackF;
        },
        click: function () {
          callback();
        },
        getAttribute: function () {},
        hasAttribute: function (name: string) {
          return name === 'disabled' ? true : false;
        },
      };
      fakeClickInteraction(() => {
        originalSetTimeout(() => {
          assert.equal(exportSpy.args.length, 0, 'should NOT export any span');
          done();
        });
      }, btn);
      sandbox.clock.tick(10);
    });

    it('should not create span when start span fails', done => {
      userInteractionInstrumentation['_tracer'].startSpan = function () {
        throw 'foo';
      };

      fakeClickInteraction(() => {
        originalSetTimeout(() => {
          assert.equal(exportSpy.args.length, 0, 'should NOT export any span');
          done();
        });
      });
      sandbox.clock.tick(10);
    });

    it('should handle task with navigation change', done => {
      fakeClickInteraction(() => {
        history.pushState(
          { test: 'testing' },
          '',
          `${location.pathname}#foo=bar1`
        );
        getData(FILE_URL, () => {
          sandbox.clock.tick(1000);
        }).then(() => {
          originalSetTimeout(() => {
            assert.equal(exportSpy.args.length, 2, 'should export 2 spans');

            const spanXhr: tracing.ReadableSpan = exportSpy.args[0][0][0];
            const spanClick: tracing.ReadableSpan = exportSpy.args[1][0][0];
            assert.equal(
              spanXhr.parentSpanId,
              spanClick.spanContext().spanId,
              'xhr span has wrong parent'
            );
            assert.equal(
              spanClick.name,
              `Navigation: ${location.pathname}#foo=bar1`
            );

            const attributes = spanClick.attributes;
            assert.equal(attributes.component, 'user-interaction');
            assert.equal(attributes.event_type, 'click');
            assert.equal(attributes.target_element, 'BUTTON');
            assert.equal(attributes.target_xpath, '//*[@id="testBtn"]');

            done();
          });
        });
      });
    });

    it('should handle task with timeout and async operation', done => {
      fakeClickInteraction(() => {
        getData(FILE_URL, () => {
          sandbox.clock.tick(1000);
        }).then(() => {
          originalSetTimeout(() => {
            assert.equal(exportSpy.args.length, 2, 'should export 2 spans');

            const spanXhr: tracing.ReadableSpan = exportSpy.args[0][0][0];
            const spanClick: tracing.ReadableSpan = exportSpy.args[1][0][0];
            assert.equal(
              spanXhr.parentSpanId,
              spanClick.spanContext().spanId,
              'xhr span has wrong parent'
            );
            assertClickSpan(spanClick);

            const attributes = spanXhr.attributes;
            assert.equal(
              attributes['http.url'],
              'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json'
            );
            // all other attributes are checked in xhr anyway

            done();
          });
        });
      });
    });

    it('should trace causality of bubbled events', () => {
      let callCount = 0;
      const listener1 = function () {
        callCount++;
      };
      const listener2 = function () {
        callCount++;
      };
      document.body.addEventListener('click', listener1);
      try {
        document.body.firstElementChild?.addEventListener('click', listener2);
        document.body.firstElementChild?.dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      } finally {
        // remove added listener so we don't pollute other tests
        document.body.removeEventListener('click', listener1);
      }
      assert.strictEqual(callCount, 2);
      assert.strictEqual(exportSpy.args.length, 2);
      assert.strictEqual(
        exportSpy.args[0][0][0].traceId,
        exportSpy.args[1][0][0].traceId
      );
      assert.strictEqual(
        exportSpy.args[0][0][0].spanId,
        exportSpy.args[1][0][0].spanContext().parentSpanId
      );
    });

    it('should handle 3 overlapping interactions', done => {
      const btn1 = document.createElement('button');
      btn1.setAttribute('id', 'btn1');
      const btn2 = document.createElement('button');
      btn2.setAttribute('id', 'btn2');
      const btn3 = document.createElement('button');
      btn3.setAttribute('id', 'btn3');
      fakeClickInteraction(() => {
        getData(FILE_URL, () => {
          sandbox.clock.tick(10);
        }).then(() => {});
      }, btn1);
      fakeClickInteraction(() => {
        getData(FILE_URL, () => {
          sandbox.clock.tick(10);
        }).then(() => {});
      }, btn2);
      fakeClickInteraction(() => {
        getData(FILE_URL, () => {
          sandbox.clock.tick(10);
        }).then(() => {});
      }, btn3);
      sandbox.clock.tick(1000);
      originalSetTimeout(() => {
        assert.equal(exportSpy.args.length, 6, 'should export 6 spans');

        const span1: tracing.ReadableSpan = exportSpy.args[0][0][0];
        const span2: tracing.ReadableSpan = exportSpy.args[1][0][0];
        const span3: tracing.ReadableSpan = exportSpy.args[2][0][0];
        const span4: tracing.ReadableSpan = exportSpy.args[3][0][0];
        const span5: tracing.ReadableSpan = exportSpy.args[4][0][0];
        const span6: tracing.ReadableSpan = exportSpy.args[5][0][0];

        assertClickSpan(span1, 'btn1');
        assertClickSpan(span2, 'btn2');
        assertClickSpan(span3, 'btn3');

        assert.strictEqual(
          span1.spanContext().spanId,
          span4.parentSpanId,
          'span4 has wrong parent'
        );
        assert.strictEqual(
          span2.spanContext().spanId,
          span5.parentSpanId,
          'span5 has wrong parent'
        );
        assert.strictEqual(
          span3.spanContext().spanId,
          span6.parentSpanId,
          'span6 has wrong parent'
        );

        done();
      });
    });

    it('should handle interactions listened on document - react < 17', done => {
      const btn1 = document.createElement('button');
      btn1.setAttribute('id', 'btn1');
      document.body.appendChild(btn1);
      const btn2 = document.createElement('button');
      btn2.setAttribute('id', 'btn2');
      document.body.appendChild(btn2);

      const listener = (event: MouseEvent) => {
        switch (event.target) {
          case btn1:
            getData(FILE_URL, () => {
              sandbox.clock.tick(10);
            }).then(() => {});
            break;
          case btn2:
            getData(FILE_URL, () => {
              sandbox.clock.tick(10);
            }).then(() => {});
            break;
        }
      };

      document.addEventListener('click', listener);

      try {
        btn1.click();
        btn2.click();
      } finally {
        // remove added listener so we don't pollute other tests
        document.removeEventListener('click', listener);
      }

      sandbox.clock.tick(1000);
      originalSetTimeout(() => {
        assert.equal(exportSpy.args.length, 4, 'should export 4 spans');

        const span1: tracing.ReadableSpan = exportSpy.args[0][0][0];
        const span2: tracing.ReadableSpan = exportSpy.args[1][0][0];
        const span3: tracing.ReadableSpan = exportSpy.args[2][0][0];
        const span4: tracing.ReadableSpan = exportSpy.args[3][0][0];

        assertClickSpan(span1, 'btn1');
        assertClickSpan(span2, 'btn2');

        assert.strictEqual(
          span1.spanContext().spanId,
          span3.parentSpanId,
          'span3 has wrong parent'
        );
        assert.strictEqual(
          span2.spanContext().spanId,
          span4.parentSpanId,
          'span4 has wrong parent'
        );

        done();
      });
    });

    it('should handle interactions listened on a parent element (bubbled events) - react >= 17', done => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const btn1 = document.createElement('button');
      btn1.setAttribute('id', 'btn1');
      root.appendChild(btn1);
      const btn2 = document.createElement('button');
      btn2.setAttribute('id', 'btn2');
      root.appendChild(btn2);

      const listenerThis: EventTarget[] = [];
      root.addEventListener('click', function (event) {
        // Assert here with failure would also affect other tests due to setTimeout bellow
        listenerThis.push(this);

        switch (event.target) {
          case btn1:
            getData(FILE_URL, () => {
              sandbox.clock.tick(10);
            }).then(() => {});
            break;
          case btn2:
            getData(FILE_URL, () => {
              sandbox.clock.tick(10);
            }).then(() => {});
            break;
        }
      });

      btn1.click();
      btn2.click();

      sandbox.clock.tick(1000);
      originalSetTimeout(() => {
        assert.strictEqual(
          listenerThis[0],
          root,
          'this inside event listener matches listened target (0)'
        );
        assert.strictEqual(
          listenerThis[1],
          root,
          'this inside event listener matches listened target (1)'
        );

        assert.equal(exportSpy.args.length, 4, 'should export 4 spans');

        const span1: tracing.ReadableSpan = exportSpy.args[0][0][0];
        const span2: tracing.ReadableSpan = exportSpy.args[1][0][0];
        const span3: tracing.ReadableSpan = exportSpy.args[2][0][0];
        const span4: tracing.ReadableSpan = exportSpy.args[3][0][0];

        assertClickSpan(span1, 'btn1');
        assertClickSpan(span2, 'btn2');

        assert.strictEqual(
          span1.spanContext().spanId,
          span3.parentSpanId,
          'span3 has wrong parent'
        );
        assert.strictEqual(
          span2.spanContext().spanId,
          span4.parentSpanId,
          'span4 has wrong parent'
        );

        done();
      });
    });

    it('should not create spans from unknown events', () => {
      fakeEventInteraction('play');
      assert.strictEqual(
        exportSpy.args.length,
        0,
        'should not export any spans'
      );
    });

    it('should export spans for configured event types', () => {
      registerTestInstrumentations({
        eventNames: ['play'],
      });

      fakeEventInteraction('play');
      assert.strictEqual(exportSpy.args.length, 1, 'should export one span');
      const span = exportSpy.args[0][0][0];
      assertInteractionSpan(span, { name: 'play' });
    });

    it('should not be exported not configured spans', () => {
      registerTestInstrumentations({
        eventNames: ['play'],
      });

      fakeClickInteraction();
      assert.strictEqual(
        exportSpy.args.length,
        0,
        'should not export any spans'
      );
    });

    it('should call shouldPreventSpanCreation with proper arguments', () => {
      const shouldPreventSpanCreation = sinon.stub();
      registerTestInstrumentations({
        shouldPreventSpanCreation,
      });

      const element = createButton();
      element.addEventListener('click', () => {});
      element.click();

      const span = exportSpy.args[0][0][0];
      assert.deepStrictEqual(shouldPreventSpanCreation.args, [
        ['click', element, span],
      ]);
    });

    describe('when shouldPreventSpanCreation returns true', () => {
      it('should not record span', () => {
        const shouldPreventSpanCreation = () => true;
        registerTestInstrumentations({
          shouldPreventSpanCreation,
        });

        const element = createButton();
        element.addEventListener('click', () => {});
        element.click();

        assert.strictEqual(
          exportSpy.args.length,
          0,
          'should not export any spans'
        );
      });
    });

    describe('when shouldPreventSpanCreation returns false', () => {
      it('should record span', () => {
        const shouldPreventSpanCreation = () => false;
        registerTestInstrumentations({
          shouldPreventSpanCreation,
        });

        const element = createButton();
        element.addEventListener('click', () => {});
        element.click();

        assert.strictEqual(exportSpy.args.length, 1, 'should export one span');
      });
    });

    it('should handle null event listener argument', () => {
      // @ts-expect-error Typescript typings report null listener as error
      // while allowed by EventTarget['addEventListener'] and js engines
      document.addEventListener('click', null);
      // @ts-expect-error see above
      document.removeEventListener('click', null);
    });

    it('should handle null useCapture', () => {
      const listener = () => {};
      // @ts-expect-error Typescript typings report null useCapture as error
      // which follows the spec but that doesn't stop users
      document.addEventListener('click', listener, null);
      // @ts-expect-error see above
      document.removeEventListener('click', listener, null);
    });

    it('should handle disable', () => {
      assert.strictEqual(
        isWrapped(HTMLElement.prototype.addEventListener),
        true,
        'addEventListener should be wrapped'
      );
      assert.strictEqual(
        isWrapped(HTMLElement.prototype.removeEventListener),
        true,
        'removeEventListener should be wrapped'
      );

      assert.strictEqual(
        isWrapped(history.replaceState),
        true,
        'replaceState should be wrapped'
      );
      assert.strictEqual(
        isWrapped(history.pushState),
        true,
        'pushState should be wrapped'
      );
      assert.strictEqual(
        isWrapped(history.back),
        true,
        'back should be wrapped'
      );
      assert.strictEqual(
        isWrapped(history.forward),
        true,
        'forward should be wrapped'
      );
      assert.strictEqual(isWrapped(history.go), true, 'go should be wrapped');

      userInteractionInstrumentation.disable();

      assert.strictEqual(
        isWrapped(HTMLElement.prototype.addEventListener),
        false,
        'addEventListener should be unwrapped'
      );
      assert.strictEqual(
        isWrapped(HTMLElement.prototype.removeEventListener),
        false,
        'removeEventListener should be unwrapped'
      );

      assert.strictEqual(
        isWrapped(history.replaceState),
        false,
        'replaceState should be unwrapped'
      );
      assert.strictEqual(
        isWrapped(history.pushState),
        false,
        'pushState should be unwrapped'
      );
      assert.strictEqual(
        isWrapped(history.back),
        false,
        'back should be unwrapped'
      );
      assert.strictEqual(
        isWrapped(history.forward),
        false,
        'forward should be unwrapped'
      );
      assert.strictEqual(
        isWrapped(history.go),
        false,
        'go should be unwrapped'
      );
    });

    describe('simulate IE', () => {
      // Save window.EventTarget reference (including enumerable state)
      const EventTargetDesc = Object.getOwnPropertyDescriptor(
        window,
        'EventTarget'
      )!;
      before(() => {
        // @ts-expect-error window.EventTarget not optional
        delete window.EventTarget;
      });
      after(() => {
        Object.defineProperty(window, 'EventTarget', EventTargetDesc);
        // Undo unwrap putting originals back on it's targets
        // @ts-expect-error event listener API not optional
        delete Node.prototype.addEventListener;
        // @ts-expect-error copy
        delete Node.prototype.removeEventListener;
        // @ts-expect-error copy
        delete Window.prototype.addEventListener;
        // @ts-expect-error copy
        delete Window.prototype.removeEventListener;
      });

      it('works with missing EventTarget', () => {
        /*
         * Would already error out with:
         * "before each" hook for "works with missing EventTarget"
         *   ReferenceError: EventTarget is not defined
         */

        fakeClickInteraction();
        assert.equal(exportSpy.args.length, 1, 'should export one span');
        const spanClick = exportSpy.args[0][0][0];
        assertClickSpan(spanClick);
      });
    });
  });
});
