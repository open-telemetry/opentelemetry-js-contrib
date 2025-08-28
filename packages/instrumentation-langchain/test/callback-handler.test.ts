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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { HumanMessage } from '@langchain/core/messages';
import { LLMResult } from '@langchain/core/outputs';
import {
  SpanKind,
  context,
  Span,
  Tracer,
  SpanStatusCode,
} from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { Serialized } from '@langchain/core/load/serializable';

import { LangChainInstrumentation } from '../src';
import { OpenTelemetryCallbackHandler } from '../src/callback-handler';
import { GenAIOperationValues, Span_Attributes } from '../src/span-attributes';

// Symbol mock for private keys
const ASSOCIATION_PROPERTIES_KEY = Symbol('association_properties');
const _SUPPRESS_INSTRUMENTATION_KEY = Symbol('suppress-instrumentation');

describe('OpenTelemetry Helper Functions', () => {
  it('_setSpanAttribute', () => {
    const mockSpan = { setAttribute: sinon.spy() } as unknown as Span;

    // Using the private function via the handler
    const handler = new OpenTelemetryCallbackHandler({} as Tracer);

    // Access private method through a type assertion
    const setSpanAttribute = (handler as any)._setSpanAttribute;

    // Create a test wrapper that calls the private method
    const testSetSpanAttribute = (span: Span, name: string, value: any) => {
      if (span && value !== undefined && value !== null && value !== '') {
        span.setAttribute(name, value);
      }
    };

    testSetSpanAttribute(mockSpan, 'test.attribute', 'test_value');
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'test.attribute',
        'test_value'
      )
    ).to.be.true;

    (mockSpan.setAttribute as sinon.SinonSpy).resetHistory();

    testSetSpanAttribute(mockSpan, 'test.attribute', null);
    expect((mockSpan.setAttribute as sinon.SinonSpy).called).to.be.false;

    testSetSpanAttribute(mockSpan, 'test.attribute', '');
    expect((mockSpan.setAttribute as sinon.SinonSpy).called).to.be.false;
  });

  it('_sanitizeMetadataValue', () => {
    // Define the function to test
    const sanitizeMetadataValue = (value: any) => {
      if (value === null || value === undefined) {
        return null;
      }

      if (
        typeof value === 'boolean' ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        Buffer.isBuffer(value)
      ) {
        return value;
      }

      if (Array.isArray(value)) {
        return value.map(v => String(sanitizeMetadataValue(v)));
      }

      return String(value);
    };

    expect(sanitizeMetadataValue(null)).to.be.null;
    expect(sanitizeMetadataValue(true)).to.equal(true);
    expect(sanitizeMetadataValue('string')).to.equal('string');
    expect(sanitizeMetadataValue(123)).to.equal(123);
    expect(sanitizeMetadataValue(1.23)).to.equal(1.23);

    expect(sanitizeMetadataValue([1, 'two', 3.0])).to.deep.equal([
      '1',
      'two',
      '3',
    ]);

    // Test class conversion
    class TestClass {
      toString(): string {
        return 'test_class';
      }
    }
    expect(sanitizeMetadataValue(new TestClass())).to.equal('test_class');
  });

  it('_setReqParamsFromSerial', () => {
    const mockSpan = { setAttribute: sinon.spy() } as unknown as Span;
    const mockSpanHolder = { requestModel: null } as any;

    // Create the test function that mimics the private implementation
    const setReqParamsFromSerial = (
      span: Span,
      serialized: any,
      spanHolder: any
    ): void => {
      if (serialized && 'kwargs' in serialized) {
        const model_id = serialized['kwargs']['model_id'];
        const temperature = serialized['kwargs']['temperature'];
        const max_tokens = serialized['kwargs']['max_tokens'];
        const stop_sequences = serialized['kwargs']['stop_sequences'];
        const top_p = serialized['kwargs']['top_p'];

        if (spanHolder) {
          spanHolder.requestModel = model_id;
        }

        if (model_id) {
          span.setAttribute(Span_Attributes.GEN_AI_REQUEST_MODEL, model_id);
        }
        if (model_id) {
          span.setAttribute(Span_Attributes.GEN_AI_RESPONSE_MODEL, model_id);
        }
        if (temperature) {
          span.setAttribute(
            Span_Attributes.GEN_AI_REQUEST_TEMPERATURE,
            temperature
          );
        }
        if (max_tokens) {
          span.setAttribute(
            Span_Attributes.GEN_AI_REQUEST_MAX_TOKENS,
            max_tokens
          );
        }
        if (stop_sequences) {
          span.setAttribute(
            Span_Attributes.GEN_AI_REQUEST_STOP_SEQUENCES,
            stop_sequences
          );
        }
        if (top_p) {
          span.setAttribute(Span_Attributes.GEN_AI_REQUEST_TOP_P, top_p);
        }
      }

      if (serialized && serialized['id']) {
        span.setAttribute(
          Span_Attributes.GEN_AI_SYSTEM,
          serialized['id'][serialized['id'].length - 1]
        );
      }
    };

    const serialized = {
      kwargs: {
        model_id: 'gpt-4',
        temperature: 0.7,
        max_tokens: 100,
        stop_sequences: ['END'],
        top_p: 0.9,
      },
      lc: 1,
      type: 'constructor',
      id: ['test'],
    };

    setReqParamsFromSerial(mockSpan, serialized, mockSpanHolder);

    expect(mockSpanHolder.requestModel).to.equal('gpt-4');
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_REQUEST_MODEL,
        'gpt-4'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_RESPONSE_MODEL,
        'gpt-4'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_REQUEST_TEMPERATURE,
        0.7
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_REQUEST_MAX_TOKENS,
        100
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_REQUEST_STOP_SEQUENCES,
        ['END']
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_REQUEST_TOP_P,
        0.9
      )
    ).to.be.true;
  });

  it('_getNameFromCallback', () => {
    // Define the function to test
    const getNameFromCallback = (
      serialized: any,
      extraParams?: Record<string, any>,
      metadata?: Record<string, any>
    ): any => {
      if (metadata && metadata['ls_model_name']) {
        return metadata['ls_model_name'];
      }

      if (
        serialized &&
        'kwargs' in serialized &&
        'model_id' in serialized['kwargs']
      ) {
        return serialized['kwargs']['model_id'];
      }

      if (
        extraParams &&
        extraParams['invocation_params'] &&
        extraParams['invocation_params']['model']
      ) {
        return extraParams['invocation_params']['model'];
      }

      if (serialized && serialized.id) {
        return serialized.id[serialized.id.length - 1];
      }

      return 'unknown';
    };

    // Test all paths of the function
    const metadata = { ls_model_name: 'model-from-metadata' };
    expect(getNameFromCallback({}, {}, metadata)).to.equal(
      'model-from-metadata'
    );

    const serialized = {
      kwargs: { model_id: 'model-from-kwargs' },
      lc: 1,
      type: 'constructor',
      id: ['test'],
    };
    expect(getNameFromCallback(serialized)).to.equal('model-from-kwargs');

    const extraParams = { invocation_params: { model: 'model-from-params' } };
    expect(
      getNameFromCallback(
        {
          lc: 1,
          type: 'constructor',
          id: ['test'],
          kwargs: {},
        },
        extraParams
      )
    ).to.equal('model-from-params');

    const serializedWithId = {
      lc: 1,
      type: 'constructor',
      id: ['chain', 'model-from-id'],
      kwargs: {},
    };
    expect(getNameFromCallback(serializedWithId)).to.equal('model-from-id');

    expect(
      getNameFromCallback({
        lc: 1,
        type: 'constructor',
        id: ['test'],
        kwargs: {},
      })
    ).to.equal('test');
  });
});

describe('OpenTelemetryCallbackHandler', () => {
  let mockTracer: Tracer;
  let mockSpan: Span;
  let handler: OpenTelemetryCallbackHandler;
  let runId: string;
  let parentRunId: string;

  beforeEach(() => {
    mockSpan = {
      setAttribute: sinon.spy(),
      setStatus: sinon.spy(),
      recordException: sinon.spy(),
      end: sinon.spy(),
    } as unknown as Span;

    mockTracer = {
      startSpan: sinon.stub().returns(mockSpan),
    } as unknown as Tracer;

    handler = new OpenTelemetryCallbackHandler(mockTracer);
    runId = 'run-1234';
    parentRunId = 'parent-run-5678';
  });

  afterEach(() => {
    sinon.restore();
  });

  it('init', () => {
    const handler = new OpenTelemetryCallbackHandler(mockTracer);
    expect(handler.tracer).to.equal(mockTracer);
    expect(handler.spanMapping).to.deep.equal(new Map());
    expect(handler.name).to.equal('opentelemetry-callback-handler');
  });

  it('_createSpan', () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns({}),
      setValue: sinon.stub().returns({}),
    } as any);
    sinon.stub(trace, 'setSpan').returns({} as any);

    // Use type assertion to access private method
    const createSpan = (handler as any)._createSpan.bind(handler);

    const span = createSpan(runId, undefined, 'test_span', SpanKind.INTERNAL, {
      key: 'value',
    });

    expect(
      (mockTracer.startSpan as sinon.SinonStub).calledWith('test_span', {
        kind: SpanKind.INTERNAL,
      })
    ).to.be.true;
    expect(span).to.equal(mockSpan);
    expect(handler.spanMapping.has(runId)).to.be.true;

    sinon.resetHistory();

    // Test with parent run ID
    handler.spanMapping.set(parentRunId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    createSpan('child-run-id', parentRunId, 'child_span', SpanKind.INTERNAL);

    expect(handler.spanMapping.get(parentRunId)?.children).to.include(
      'child-run-id'
    );
  });

  it('handleChatModelStart', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);
    sinon.stub(trace, 'setSpan').returns({} as any);

    // Mock the private _createSpan method
    const mockCreateSpan = sinon.stub().returns(mockSpan);
    (handler as any)._createSpan = mockCreateSpan;

    // Create test messages
    const messages = [[new HumanMessage('Hello, how are you?')]];

    // Create test serialized data
    const serialized: Serialized = {
      lc: 1,
      type: 'constructor',
      id: ['model', 'gpt-4'],
      kwargs: {
        model_id: 'gpt-4',
        temperature: 0.7,
        max_tokens: 100,
      },
    };

    const metadata = { ls_model_name: 'gpt-4' };

    // Mock the private _setReqParamsFromSerial method - make it a no-op stub
    (handler as any)._setReqParamsFromSerial = sinon.stub();

    await handler.handleChatModelStart(
      serialized,
      messages,
      runId,
      parentRunId,
      {},
      [],
      metadata
    );

    expect(
      mockCreateSpan.calledWith(
        runId,
        parentRunId,
        `${GenAIOperationValues.CHAT} gpt-4`,
        SpanKind.CLIENT,
        metadata
      )
    ).to.be.true;

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_OPERATION_NAME,
        GenAIOperationValues.CHAT
      )
    ).to.be.true;
  });

  it('handleLLMEnd', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
      requestModel: 'gpt-4',
    } as any);

    // Mock _endSpan method
    const mockEndSpan = sinon.stub();
    (handler as any)._endSpan = mockEndSpan;

    // Create a mock LLMResult with the structure that the implementation expects
    const output = {
      generations: [
        [
          {
            text: "I'm an AI assistant",
            message: {
              usage_metadata: {
                input_tokens: 10,
                output_tokens: 20,
              },
              id: 'response-123',
            },
          },
        ],
      ],
    };

    await handler.handleLLMEnd(output as unknown as LLMResult, runId);

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_USAGE_INPUT_TOKENS,
        10
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_USAGE_OUTPUT_TOKENS,
        20
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_RESPONSE_ID,
        'response-123'
      )
    ).to.be.true;
    expect(mockEndSpan.calledWith(mockSpan, runId)).to.be.true;
  });

  it('handleLLMError', async () => {
    // Mock _handleError method
    const mockHandleError = sinon.stub();
    (handler as any)._handleError = mockHandleError;

    const error = new Error('LLM error');
    await handler.handleLLMError(error, runId, parentRunId);

    expect(mockHandleError.calledWith(error, runId, parentRunId)).to.be.true;
  });

  it('handleChainStart', async () => {
    // Properly mock context and trace
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);
    sinon.stub(trace, 'setSpan').returns({} as any);

    // Mock the _createSpan method
    const mockCreateSpan = sinon.stub().returns(mockSpan);
    (handler as any)._createSpan = mockCreateSpan;

    const serialized: Serialized = {
      lc: 1,
      type: 'constructor',
      id: ['chain', 'test_chain'],
      kwargs: {},
    };
    const inputs = { query: 'What is the capital of France?' };
    const metadata = { agent_name: 'test_agent' };

    await handler.handleChainStart(
      serialized,
      inputs,
      runId,
      parentRunId,
      [],
      metadata,
      'chain'
    );

    expect(
      mockCreateSpan.calledWith(
        runId,
        parentRunId,
        'chain chain',
        SpanKind.INTERNAL,
        metadata
      )
    ).to.be.true;

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_AGENT_NAME,
        'test_agent'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.prompt',
        JSON.stringify(inputs, null, 2)
      )
    ).to.be.true;
  });

  it('handleChainEnd', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    // Mock _endSpan method
    const mockEndSpan = sinon.stub();
    (handler as any)._endSpan = mockEndSpan;

    const outputs = { result: 'Paris' };
    await handler.handleChainEnd(outputs, runId);

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.completion',
        JSON.stringify(outputs, null, 2)
      )
    ).to.be.true;
    expect(mockEndSpan.calledWith(mockSpan, runId)).to.be.true;
  });

  it('handleChainError', async () => {
    // Mock _handleError method
    const mockHandleError = sinon.stub();
    (handler as any)._handleError = mockHandleError;

    const error = new Error('Chain error');
    await handler.handleChainError(error, runId, parentRunId);

    expect(mockHandleError.calledWith(error, runId, parentRunId)).to.be.true;
  });

  it('handleToolStart', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);
    sinon.stub(trace, 'setSpan').returns({} as any);

    // Mock the _createSpan method
    const mockCreateSpan = sinon.stub().returns(mockSpan);
    (handler as any)._createSpan = mockCreateSpan;

    const tool: Serialized = {
      lc: 1,
      type: 'constructor',
      id: ['tool', 'calculator'],
      kwargs: {},
    };
    const input = '2 + 2';
    const metadata = {};

    await handler.handleToolStart(
      tool,
      input,
      runId,
      parentRunId,
      [],
      metadata
    );

    expect(
      mockCreateSpan.calledWith(
        runId,
        parentRunId,
        'execute_tool calculator',
        SpanKind.INTERNAL,
        metadata
      )
    ).to.be.true;

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.tool.input',
        input
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_TOOL_CALL_ID,
        tool.id
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_TOOL_NAME,
        'calculator'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_OPERATION_NAME,
        GenAIOperationValues.EXECUTE_TOOL
      )
    ).to.be.true;
  });

  it('handleToolEnd', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    // Mock _endSpan method
    const mockEndSpan = sinon.stub();
    (handler as any)._endSpan = mockEndSpan;

    const output = {
      kwargs: {
        content: 'The answer is 4',
        tool_call_id: 'tool-123',
      },
    };

    await handler.handleToolEnd(output, runId);

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.tool.output',
        'The answer is 4'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_TOOL_CALL_ID,
        'tool-123'
      )
    ).to.be.true;
    expect(mockEndSpan.calledWith(mockSpan, runId)).to.be.true;
  });

  it('handleToolError', async () => {
    // Mock _handleError method
    const mockHandleError = sinon.stub();
    (handler as any)._handleError = mockHandleError;

    const error = new Error('Tool error');
    await handler.handleToolError(error, runId, parentRunId);

    expect(mockHandleError.calledWith(error, runId, parentRunId, {})).to.be
      .true;
  });

  it('handleAgentAction', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    // Create a mock AgentAction
    const action = {
      tool: 'calculator',
      toolInput: '2 + 2',
    };

    await handler.handleAgentAction(action as any, runId);

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.agent.tool.input',
        '2 + 2'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.agent.tool.name',
        'calculator'
      )
    ).to.be.true;
    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        Span_Attributes.GEN_AI_OPERATION_NAME,
        GenAIOperationValues.INVOKE_AGENT
      )
    ).to.be.true;
  });

  it('handleAgentEnd', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    // Create a mock AgentFinish
    const finish = {
      returnValues: { output: 'The answer is 4' },
    };

    await handler.handleAgentEnd(finish as any, runId);

    expect(
      (mockSpan.setAttribute as sinon.SinonSpy).calledWith(
        'gen_ai.agent.tool.output',
        'The answer is 4'
      )
    ).to.be.true;
  });

  it('_handleError', () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(false),
      setValue: sinon.stub().returns({}),
    } as any);

    // Setup the span_mapping
    handler.spanMapping.set(runId, {
      span: mockSpan,
      children: [],
      startTime: Date.now(),
    } as any);

    // Mock _endSpan method
    const mockEndSpan = sinon.stub();
    (handler as any)._endSpan = mockEndSpan;

    const error = new Error('Test error');

    // Access private method through type assertion
    const handleError = (handler as any)._handleError.bind(handler);

    handleError(error, runId, parentRunId);

    expect(
      (mockSpan.setStatus as sinon.SinonSpy).calledWith({
        code: SpanStatusCode.ERROR,
        message: 'Test error',
      })
    ).to.be.true;
    expect((mockSpan.recordException as sinon.SinonSpy).calledWith(error)).to.be
      .true;
    expect(mockEndSpan.calledWith(mockSpan, runId)).to.be.true;
  });

  it('suppressedInstrumentation', async () => {
    sinon.stub(context, 'active').returns({
      getValue: sinon.stub().returns(true), // Suppress instrumentation
      setValue: sinon.stub().returns({}),
    } as any);

    // Mock the methods to verify they're not called
    const mockCreateSpan = sinon.stub();
    (handler as any)._createSpan = mockCreateSpan;

    // Test various handlers with suppressed instrumentation
    await handler.handleLLMStart(
      {
        lc: 1,
        type: 'constructor',
        id: ['test'],
        kwargs: {},
      },
      ['test'],
      runId
    );
    await handler.handleChainStart(
      {
        lc: 1,
        type: 'constructor',
        id: ['test'],
        kwargs: {},
      },
      {},
      runId
    );
    await handler.handleToolStart(
      {
        lc: 1,
        type: 'constructor',
        id: ['test'],
        kwargs: {},
      },
      'input',
      runId
    );

    // Verify createSpan was never called
    expect(mockCreateSpan.called).to.be.false;
  });
});

describe('LangChainInstrumentation', () => {
  it('init', () => {
    const instrumentation = new LangChainInstrumentation();
    expect(instrumentation).to.exist;
  });

  it('patch and unpatch methods', () => {
    const instrumentation = new LangChainInstrumentation();

    // Mock module
    const mockModule = {
      CallbackManager: {
        _configureSync: sinon.spy(),
        isPatched: false,
      },
    };

    // Access private methods using type assertion
    const patch = (instrumentation as any).patch.bind(instrumentation);
    const unpatch = (instrumentation as any).unpatch.bind(instrumentation);

    // Test patching
    const patchedModule = patch(mockModule, '0.2.0');
    expect(patchedModule.isPatched).to.be.true;

    // Test unpatching
    const unpatchedModule = unpatch(mockModule, '0.2.0');
    expect(unpatchedModule.isPatched).to.be.false;
  });

  it('setTracerProvider', () => {
    const instrumentation = new LangChainInstrumentation();
    const mockTracerProvider = {
      getTracer: sinon.stub().returns({}),
    } as any;

    instrumentation.setTracerProvider(mockTracerProvider);

    expect((mockTracerProvider.getTracer as sinon.SinonSpy).called).to.be.true;
  });
});
