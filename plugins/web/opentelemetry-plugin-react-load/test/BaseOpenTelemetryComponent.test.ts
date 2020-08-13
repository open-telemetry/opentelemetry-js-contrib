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

import { context, Logger, propagation, trace } from '@opentelemetry/api';
import { ConsoleLogger, B3Propagator, isWrapped } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
} from '@opentelemetry/tracing';
import { StackContextManager } from '@opentelemetry/web';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as sinon from 'sinon';
import AllLifecycles from './test-react-components/AllLifecycles';
import MissingRender from './test-react-components/MissingRender';
import MissingComponentDidMount from './test-react-components/MissingComponentDidMount';
import MissingShouldComponentUpdate from './test-react-components/MissingShouldComponentUpdate';
import MissingGetSnapshotBeforeUpdate from './test-react-components/MissingGetSnapshotBeforeUpdate';
import MissingComponentDidUpdate from './test-react-components/MissingComponentDidUpdate';
import ShouldComponentUpdateFalse from './test-react-components/ShouldComponentUpdateFalse';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { AttributeNames } from '../src/enums/AttributeNames';
import { BaseOpenTelemetryComponent } from '../src';

export class DummyExporter implements SpanExporter {
  export(spans: ReadableSpan[]): any {}
  shutdown(): any {}
}

interface TestCases {
  component: any;
  testName: string;
}

describe('ReactLoad Instrumentation', () => {
  let provider: BasicTracerProvider;
  let logger: Logger;
  let spanProcessor: SimpleSpanProcessor;
  let dummyExporter: DummyExporter;
  let contextManager: StackContextManager;
  let sandbox: sinon.SinonSandbox;
  let exportSpy: any;
  let rootContainer: any;

  before(() => {
    propagation.setGlobalPropagator(new B3Propagator());
    contextManager = new StackContextManager().enable();
    context.setGlobalContextManager(contextManager);

    provider = new BasicTracerProvider();
    logger = new ConsoleLogger();

    dummyExporter = new DummyExporter();
    spanProcessor = new SimpleSpanProcessor(dummyExporter);
    provider.addSpanProcessor(spanProcessor);
    sandbox = sinon.createSandbox();

    trace.setGlobalTracerProvider(provider);

    BaseOpenTelemetryComponent.setTracer('default');
    BaseOpenTelemetryComponent.setLogger(logger);
  });

  after(() => {
    context.disable();
  });

  beforeEach(() => {
    exportSpy = sandbox.spy(dummyExporter, 'export');
  });

  afterEach(() => {
    sandbox.restore();
  });

  const componentTestCases: TestCases[] = [
    {
      component: AllLifecycles,
      testName: 'when every lifecycle method is defined in the source code',
    },
    {
      component: MissingRender,
      testName: 'when render is NOT defined in the source code',
    },
    {
      component: MissingComponentDidMount,
      testName: 'when componentDidMount is NOT defined in the source code',
    },
    {
      component: MissingShouldComponentUpdate,
      testName: 'when shouldComponentUpdate is NOT defined in the source code',
    },
    {
      component: MissingGetSnapshotBeforeUpdate,
      testName:
        'when getSnapshotBeforeUpdate is NOT defined in the source code',
    },
    {
      component: MissingComponentDidUpdate,
      testName: 'when componentDidUpdate is NOT defined in the source code',
    },
  ];

  componentTestCases.forEach(testCase => {
    describe(testCase.testName, () => {
      let component: any;
      let constructed: BaseOpenTelemetryComponent;

      beforeEach(() => {
        component = testCase.component;
        constructed = new component();
      });

      it('should always have defined lifecycle methods', () => {
        assert.ok(constructed.render, 'render is not defined');
        assert.ok(
          constructed.componentDidMount,
          'componentDidMount is not defined'
        );

        assert.ok(
          constructed.shouldComponentUpdate,
          'shouldComponentUpdate is not defined'
        );
        assert.ok(
          constructed.getSnapshotBeforeUpdate,
          'getSnapshotBeforeUpdate is not defined'
        );
        assert.ok(
          constructed.componentDidUpdate,
          'componentDidUpdate is not defined'
        );
      });

      it('should wrap functions', () => {
        assert.ok(
          isWrapped(constructed.render),
          'render function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.componentDidMount),
          'componentDidMount function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.shouldComponentUpdate),
          'shouldComponentUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.getSnapshotBeforeUpdate),
          'getSnapshotBeforeUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.componentDidUpdate),
          'componentDidUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.setState),
          'setState function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.forceUpdate),
          'forceUpdate function is not wrapped before'
        );

        constructed.patch();

        assert.ok(
          isWrapped(constructed.render),
          'render function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.componentDidMount),
          'componentDidMount function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.shouldComponentUpdate),
          'shouldComponentUpdate function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.getSnapshotBeforeUpdate),
          'getSnapshotBeforeUpdate function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.componentDidUpdate),
          'componentDidUpdate function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.setState),
          'setState function is not wrapped after'
        );
        assert.ok(
          isWrapped(constructed.forceUpdate),
          'forceUpdate function is not wrapped after'
        );
      });

      it('should unwrap functions', () => {
        assert.ok(
          isWrapped(constructed.render),
          'render function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.componentDidMount),
          'componentDidMount function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.shouldComponentUpdate),
          'shouldComponentUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.getSnapshotBeforeUpdate),
          'getSnapshotBeforeUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.componentDidUpdate),
          'componentDidUpdate function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.setState),
          'setState function is not wrapped before'
        );
        assert.ok(
          isWrapped(constructed.forceUpdate),
          'forceUpdate function is not wrapped before'
        );

        constructed.unpatch();

        assert.ok(
          !isWrapped(constructed.render),
          'render function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.componentDidMount),
          'componentDidMount function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.shouldComponentUpdate),
          'shouldComponentUpdate function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.getSnapshotBeforeUpdate),
          'getSnapshotBeforeUpdate function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.componentDidUpdate),
          'componentDidUpdate function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.setState),
          'setState function is not unwrapped after'
        );
        assert.ok(
          !isWrapped(constructed.forceUpdate),
          'forceUpdate function is not unwrapped after'
        );
      });

      describe('AND component is mounting', () => {
        beforeEach(() => {
          rootContainer = document.createElement('div');
          document.body.appendChild(rootContainer);
          const reactElement = React.createElement(component, null, null);
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

          assert.strictEqual(
            exportSpy.args.length,
            3,
            'total number of spans is wrong'
          );
        });

        it('spans should have correct name', () => {
          const renderSpan: ReadableSpan = exportSpy.args[0][0][0];
          const componentDidMountSpan: ReadableSpan = exportSpy.args[1][0][0];
          const mountingSpan: ReadableSpan = exportSpy.args[2][0][0];

          assert.equal(
            mountingSpan.name,
            'reactLoad: mounting',
            'mounting span has wrong name'
          );
          assert.equal(renderSpan.name, 'render', 'render span has wrong name');
          assert.equal(
            componentDidMountSpan.name,
            'componentDidMount',
            'componentDidMount span has wrong name'
          );
        });

        it('spans should have correct attributes', () => {
          const spans: [] = exportSpy.args;
          assert.strictEqual(spans.length, 3, 'number of spans is wrong');
          spans.forEach(element => {
            const span: ReadableSpan = element[0][0];
            const attributes = span.attributes;
            const keys = Object.keys(attributes);

            assert.ok(
              attributes[keys[0]] !== '',
              `attributes ${GeneralAttribute.COMPONENT} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[1]] !== '',
              `attributes ${AttributeNames.LOCATION_URL} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[2]] !== '',
              `attributes ${AttributeNames.REACT_NAME} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[3]] !== '',
              `attributes ${AttributeNames.REACT_STATE} is not defined for span "${span.name}"`
            );

            assert.strictEqual(
              keys.length,
              4,
              `number of attributes is wrong for span "${span.name}"`
            );
          });
        });
      });

      describe('AND component is updated by calling setState()', () => {
        beforeEach(() => {
          rootContainer = document.createElement('div');
          document.body.appendChild(rootContainer);
          const reactElement = React.createElement(component, null, null);
          act(() => {
            const reactComponent = ReactDOM.render(reactElement, rootContainer);
            reactComponent.setState({ test: 'newState' });
          });
        });

        afterEach(() => {
          document.body.removeChild(rootContainer);
          rootContainer = null;
        });

        it('should export spans setState(), shouldComponentUpdate, render, getSnapshotBeforeUpdate, and componentDidUpdate as children', () => {
          const setStateSpan: ReadableSpan = exportSpy.args[3][0][0];
          const shouldComponentUpdateSpan: ReadableSpan =
            exportSpy.args[4][0][0];
          const renderSpan: ReadableSpan = exportSpy.args[5][0][0];
          const getSnapshotBeforeUpdateSpan: ReadableSpan =
            exportSpy.args[6][0][0];
          const componentDidUpdateSpan: ReadableSpan = exportSpy.args[7][0][0];
          const updatingSpan: ReadableSpan = exportSpy.args[8][0][0];

          assert.equal(
            updatingSpan.parentSpanId,
            undefined,
            'updating span is should not have a parent'
          );
          assert.equal(
            setStateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'setState span is not a child of the updating span'
          );
          assert.equal(
            shouldComponentUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'shouldComponentUpdate span is not a child of the updating span'
          );
          assert.equal(
            renderSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'render span is not a child of the updating span'
          );
          assert.equal(
            getSnapshotBeforeUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'getSnapshotBeforeUpdate span is not a child of the updating span'
          );
          assert.equal(
            componentDidUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'componentDidUpdate span is not a child of the updating span'
          );

          assert.strictEqual(
            exportSpy.args.length,
            9,
            'total number of spans is wrong'
          );
        });

        it('spans should have correct name', () => {
          const setStateSpan: ReadableSpan = exportSpy.args[3][0][0];
          const shouldComponentUpdateSpan: ReadableSpan =
            exportSpy.args[4][0][0];
          const renderSpan: ReadableSpan = exportSpy.args[5][0][0];
          const getSnapshotBeforeUpdateSpan: ReadableSpan =
            exportSpy.args[6][0][0];
          const componentDidUpdateSpan: ReadableSpan = exportSpy.args[7][0][0];
          const updatingSpan: ReadableSpan = exportSpy.args[8][0][0];

          assert.equal(
            updatingSpan.name,
            'reactLoad: updating',
            'updating span has wrong name'
          );
          assert.equal(
            setStateSpan.name,
            'setState()',
            'setState span has wrong name'
          );
          assert.equal(
            shouldComponentUpdateSpan.name,
            'shouldComponentUpdate',
            'shouldComponentUpdate span has wrong name'
          );
          assert.equal(renderSpan.name, 'render', 'render span has wrong name');
          assert.equal(
            getSnapshotBeforeUpdateSpan.name,
            'getSnapshotBeforeUpdate',
            'getSnapshotBeforeUpdate span has wrong name'
          );
          assert.equal(
            componentDidUpdateSpan.name,
            'componentDidUpdate',
            'componentDidUpdate span has wrong name'
          );
        });

        it('spans should have correct attributes', () => {
          const spans: [] = exportSpy.args;
          assert.strictEqual(spans.length, 9, 'number of spans is wrong');
          spans.forEach(element => {
            const span: ReadableSpan = element[0][0];
            const attributes = span.attributes;
            const keys = Object.keys(attributes);

            assert.ok(
              attributes[keys[0]] !== '',
              `attributes ${GeneralAttribute.COMPONENT} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[1]] !== '',
              `attributes ${AttributeNames.LOCATION_URL} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[2]] !== '',
              `attributes ${AttributeNames.REACT_NAME} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[3]] !== '',
              `attributes ${AttributeNames.REACT_STATE} is not defined for span "${span.name}"`
            );

            assert.strictEqual(
              keys.length,
              4,
              `number of attributes is wrong for span "${span.name}"`
            );
          });
        });
      });

      describe('AND component is updated by calling forceUpdate()', () => {
        beforeEach(() => {
          rootContainer = document.createElement('div');
          document.body.appendChild(rootContainer);
          const reactElement = React.createElement(component, null, null);
          act(() => {
            const reactComponent = ReactDOM.render(reactElement, rootContainer);
            reactComponent.forceUpdate();
          });
        });

        afterEach(() => {
          document.body.removeChild(rootContainer);
          rootContainer = null;
        });

        it('should export spans forceUpdate(), render, getSnapshotBeforeUpdate, and componentDidUpdate as children', () => {
          const forceUpdateSpan: ReadableSpan = exportSpy.args[3][0][0];
          const renderSpan: ReadableSpan = exportSpy.args[4][0][0];
          const getSnapshotBeforeUpdateSpan: ReadableSpan =
            exportSpy.args[5][0][0];
          const componentDidUpdateSpan: ReadableSpan = exportSpy.args[6][0][0];
          const updatingSpan: ReadableSpan = exportSpy.args[7][0][0];

          assert.equal(
            updatingSpan.parentSpanId,
            undefined,
            'updating span is should not have a parent'
          );
          assert.equal(
            forceUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'forceUpdate span is not a child of the updating span'
          );
          assert.equal(
            renderSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'render span is not a child of the updating span'
          );
          assert.equal(
            getSnapshotBeforeUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'getSnapshotBeforeUpdate span is not a child of the updating span'
          );
          assert.equal(
            componentDidUpdateSpan.parentSpanId,
            updatingSpan.spanContext.spanId,
            'componentDidUpdate span is not a child of the updating span'
          );

          assert.strictEqual(
            exportSpy.args.length,
            8,
            'total number of spans is wrong'
          );
        });

        it('spans should have correct name', () => {
          const forceUpdateSpan: ReadableSpan = exportSpy.args[3][0][0];
          const renderSpan: ReadableSpan = exportSpy.args[4][0][0];
          const getSnapshotBeforeUpdateSpan: ReadableSpan =
            exportSpy.args[5][0][0];
          const componentDidUpdateSpan: ReadableSpan = exportSpy.args[6][0][0];
          const updatingSpan: ReadableSpan = exportSpy.args[7][0][0];

          assert.equal(
            updatingSpan.name,
            'reactLoad: updating',
            'updating span has wrong name'
          );
          assert.equal(
            forceUpdateSpan.name,
            'forceUpdate()',
            'forceUpdate span has wrong name'
          );
          assert.equal(renderSpan.name, 'render', 'render span has wrong name');
          assert.equal(
            getSnapshotBeforeUpdateSpan.name,
            'getSnapshotBeforeUpdate',
            'getSnapshotBeforeUpdate span has wrong name'
          );
          assert.equal(
            componentDidUpdateSpan.name,
            'componentDidUpdate',
            'componentDidUpdate span has wrong name'
          );
        });

        it('spans should have correct attributes', () => {
          const spans: [] = exportSpy.args;
          assert.strictEqual(spans.length, 8, 'number of spans is wrong');
          spans.forEach(element => {
            const span: ReadableSpan = element[0][0];
            const attributes = span.attributes;
            const keys = Object.keys(attributes);

            assert.ok(
              attributes[keys[0]] !== '',
              `attributes ${GeneralAttribute.COMPONENT} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[1]] !== '',
              `attributes ${AttributeNames.LOCATION_URL} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[2]] !== '',
              `attributes ${AttributeNames.REACT_NAME} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[3]] !== '',
              `attributes ${AttributeNames.REACT_STATE} is not defined for span "${span.name}"`
            );

            assert.strictEqual(
              keys.length,
              4,
              `number of attributes is wrong for span "${span.name}"`
            );
          });
        });
      });

      describe('AND component is unmounting', () => {
        beforeEach(() => {
          rootContainer = document.createElement('div');
          document.body.appendChild(rootContainer);
          const reactElement = React.createElement(component, null, null);
          act(() => {
            ReactDOM.render(reactElement, rootContainer);
            ReactDOM.unmountComponentAtNode(rootContainer);
          });
        });

        afterEach(() => {
          document.body.removeChild(rootContainer);
          rootContainer = null;
        });

        it('should export spans render and componentDidMount as children', () => {
          const componentWillUnmountSpan: ReadableSpan =
            exportSpy.args[3][0][0];
          const unmountingSpan: ReadableSpan = exportSpy.args[4][0][0];

          assert.equal(
            unmountingSpan.parentSpanId,
            undefined,
            'unmounting span is should not have a parent'
          );
          assert.equal(
            componentWillUnmountSpan.parentSpanId,
            unmountingSpan.spanContext.spanId,
            'componentWillUnmount span is not a child of the unmounting span'
          );

          assert.strictEqual(
            exportSpy.args.length,
            5,
            'total number of spans is wrong'
          );
        });

        it('spans should have correct name', () => {
          const componentWillUnmountSpan: ReadableSpan =
            exportSpy.args[3][0][0];
          const unmountingSpan: ReadableSpan = exportSpy.args[4][0][0];

          assert.equal(
            unmountingSpan.name,
            'reactLoad: unmounting',
            'unmounting span has wrong name'
          );
          assert.equal(
            componentWillUnmountSpan.name,
            'componentWillUnmount',
            'componentWillUnmount span has wrong name'
          );
        });

        it('spans should have correct attributes', () => {
          const spans: [] = exportSpy.args;
          assert.strictEqual(spans.length, 5, 'number of spans is wrong');
          spans.forEach(element => {
            const span: ReadableSpan = element[0][0];
            const attributes = span.attributes;
            const keys = Object.keys(attributes);

            assert.ok(
              attributes[keys[0]] !== '',
              `attributes ${GeneralAttribute.COMPONENT} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[1]] !== '',
              `attributes ${AttributeNames.LOCATION_URL} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[2]] !== '',
              `attributes ${AttributeNames.REACT_NAME} is not defined for span "${span.name}"`
            );

            assert.ok(
              attributes[keys[3]] !== '',
              `attributes ${AttributeNames.REACT_STATE} is not defined for span "${span.name}"`
            );

            assert.strictEqual(
              keys.length,
              4,
              `number of attributes is wrong for span "${span.name}"`
            );
          });
        });
      });
    });
  });

  describe('when updating AND shouldComponentUpdate returns false', () => {
    beforeEach(() => {
      rootContainer = document.createElement('div');
      document.body.appendChild(rootContainer);
      const reactElement = React.createElement(
        ShouldComponentUpdateFalse,
        null,
        null
      );
      act(() => {
        const reactComponent = ReactDOM.render(reactElement, rootContainer);
        reactComponent.setState({ test: 'newState' });
      });
    });

    afterEach(() => {
      document.body.removeChild(rootContainer);
      rootContainer = null;
    });

    it('should export spans setState() and shouldComponentUpdate as children', () => {
      const setStateSpan: ReadableSpan = exportSpy.args[3][0][0];
      const shouldComponentUpdateSpan: ReadableSpan = exportSpy.args[4][0][0];
      const updatingSpan: ReadableSpan = exportSpy.args[5][0][0];

      assert.equal(
        updatingSpan.parentSpanId,
        undefined,
        'updating span is should not have a parent'
      );
      assert.equal(
        setStateSpan.parentSpanId,
        updatingSpan.spanContext.spanId,
        'setState span is not a child of the updating span'
      );
      assert.equal(
        shouldComponentUpdateSpan.parentSpanId,
        updatingSpan.spanContext.spanId,
        'shouldComponentUpdate span is not a child of the updating span'
      );

      assert.strictEqual(
        exportSpy.args.length,
        6,
        'total number of spans is wrong'
      );
    });

    it('spans should have correct name', () => {
      const setStateSpan: ReadableSpan = exportSpy.args[3][0][0];
      const shouldComponentUpdateSpan: ReadableSpan = exportSpy.args[4][0][0];
      const updatingSpan: ReadableSpan = exportSpy.args[5][0][0];

      assert.equal(
        updatingSpan.name,
        'reactLoad: updating',
        'updating span has wrong name'
      );
      assert.equal(
        setStateSpan.name,
        'setState()',
        'setState span has wrong name'
      );
      assert.equal(
        shouldComponentUpdateSpan.name,
        'shouldComponentUpdate',
        'shouldComponentUpdate span has wrong name'
      );
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

        assert.ok(
          attributes[keys[1]] !== '',
          `attributes ${AttributeNames.LOCATION_URL} is not defined for span "${span.name}"`
        );

        assert.ok(
          attributes[keys[2]] !== '',
          `attributes ${AttributeNames.REACT_NAME} is not defined for span "${span.name}"`
        );

        assert.ok(
          attributes[keys[3]] !== '',
          `attributes ${AttributeNames.REACT_STATE} is not defined for span "${span.name}"`
        );

        assert.strictEqual(
          keys.length,
          4,
          `number of attributes is wrong for span "${span.name}"`
        );
      });
    });
  });
});
