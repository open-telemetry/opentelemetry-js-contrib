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

import {
    context,
    Logger,
    propagation,
  } from '@opentelemetry/api';
  import {
    ConsoleLogger,
    B3Propagator,
    isWrapped
  } from '@opentelemetry/core';
  import {
    BasicTracerProvider,
    SimpleSpanProcessor,
    SpanExporter,
    ReadableSpan,
  } from '@opentelemetry/tracing';
  import {
    StackContextManager,
  } from '@opentelemetry/web';
  import {
    GeneralAttribute,
  } from '@opentelemetry/semantic-conventions';
  import * as assert from 'assert';
  import * as sinon from 'sinon';
  import { ReactLoad } from '../src';
  import AllLifecycles from './test-react-components/AllLifecycles';
  import MissingRender from './test-react-components/MissingRender';
  import MissingComponentDidMount from './test-react-components/MissingComponentDidMount';
  import * as React from "react";
  import * as ReactDOM from "react-dom";
  import { act } from 'react-dom/test-utils';

  export class DummyExporter implements SpanExporter {
    export(spans: any) {}
    shutdown() {}
  }

  interface TestCases {
    component: any,
    testName: string,
  }

  describe('ReactLoad Plugin', () => {
    let reactPlugin: ReactLoad;
    let moduleExports: any;
    let provider: BasicTracerProvider;
    let logger: Logger;
    let reactComponents: any[];
    let spanProcessor: SimpleSpanProcessor;
    let dummyExporter: DummyExporter;
    let contextManager: StackContextManager;
    let sandbox: sinon.SinonSandbox;
    let exportSpy: any;
    let rootContainer: any;

    beforeEach(() => {
      contextManager = new StackContextManager().enable();
      context.setGlobalContextManager(contextManager);
      moduleExports = {};
      provider = new BasicTracerProvider();
      logger = new ConsoleLogger();
      
      dummyExporter = new DummyExporter();
      spanProcessor = new SimpleSpanProcessor(dummyExporter);
      provider.addSpanProcessor(spanProcessor);
      sandbox = sinon.createSandbox();
      exportSpy = sandbox.stub(dummyExporter, 'export');
    });
  
    afterEach(() => {
      context.disable();
      sandbox.restore();
    });
  
    before(() => {
      propagation.setGlobalPropagator(new B3Propagator());
    });

    const componentTestCases: TestCases[] = [
      { component: AllLifecycles, testName: "when every lifecycle method is defined in the source code"},
      { component: MissingRender, testName: "when render is NOT defined in the source code"},
      { component: MissingComponentDidMount, testName: "when componentDidMount is NOT defined in the source code"},
    ];

    componentTestCases.forEach(testCase => {
      describe(testCase.testName, () => {
        let component: any;

        beforeEach(() => {
          component = testCase.component;
          reactComponents = [component];
          reactPlugin = new ReactLoad(reactComponents);
          reactPlugin.enable(moduleExports, provider, logger);
        });

        it('should always have defined lifecycle methods', () => {
          assert.ok(component.prototype.render, 'render is not defined');
          assert.ok(component.prototype.componentDidMount, 'componentDidMount is not defined');
        });

        it('should wrap render()', () => {
          assert.ok(isWrapped(component.prototype.render));
          reactPlugin.enable(moduleExports, provider, logger);
          assert.ok(isWrapped(component.prototype.render));
        });

        it('should unwrap render()', () => {
          assert.ok(isWrapped(component.prototype.render));
          reactPlugin.disable();
          assert.ok(!isWrapped(component.prototype.render));
        });

        it('should wrap componentDidMount()', () => {
          assert.ok(isWrapped(component.prototype.componentDidMount));
          reactPlugin.enable(moduleExports, provider, logger);
          assert.ok(isWrapped(component.prototype.componentDidMount));
        });

        it('should unwrap componentDidMount()', () => {
          assert.ok(isWrapped(component.prototype.componentDidMount));
          reactPlugin.disable();
          assert.ok(!isWrapped(component.prototype.componentDidMount));
        });

        describe('AND component is mounting', () => {
          beforeEach(() => {
            rootContainer = document.createElement("div");
            document.body.appendChild(rootContainer);
            var reactElement = React.createElement(component, null, null);
            act(() => {
              ReactDOM.render(reactElement, rootContainer);
            });
          });

          afterEach(() => {
            document.body.removeChild(rootContainer);
            rootContainer = null;
          });
          
          it('should export spans render and componentDidMount as children', () => {
            const renderSpan: ReadableSpan = exportSpy.args[0][0][0];
            const componentDidMountSpan: ReadableSpan = exportSpy.args[1][0][0];
            const mountingSpan: ReadableSpan = exportSpy.args[2][0][0];

            assert.equal(
              mountingSpan.parentSpanId, 
              undefined, 
              'mounting span is should not have a parent'
            );
            assert.equal(
              renderSpan.parentSpanId, 
              mountingSpan.spanContext.spanId, 
              'render span is not a child of the mounting span'
            );
            assert.equal(
              componentDidMountSpan.parentSpanId,
              mountingSpan.spanContext.spanId, 
              'componentDidMount span is not a child of the mounting span'
            );
          });

          it('spans should have correct name', () => {
            const renderSpan: ReadableSpan = exportSpy.args[0][0][0];
            const componentDidMountSpan: ReadableSpan = exportSpy.args[1][0][0];
            const mountingSpan: ReadableSpan = exportSpy.args[2][0][0];

            assert.equal(mountingSpan.name, 'reactLoad: mounting', 'mounting span has wrong name');
            assert.equal(renderSpan.name, 'render', 'render span has wrong name');
            assert.equal(componentDidMountSpan.name, 'componentDidMount', 'componentDidMount span has wrong name');
          });

          it('spans should have correct attributes', () => {
            const spans: [] = exportSpy.args;
            spans.forEach(element => {
              const span: ReadableSpan = element[0][0];
              const attributes = span.attributes;
              const keys = Object.keys(attributes);

              assert.ok(
                attributes[keys[0]] !== '',
                `attributes ${GeneralAttribute.COMPONENT} is not defined for span "${span.name}"`
              );

              assert.strictEqual(keys.length, 1, `number of attributes is wrong for span "${span.name}"`);
            });
          });
        });
      });
    });
  });
