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
import { Span, SpanKind, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { GenAIOperationValues, Span_Attributes } from './span-attributes';
import { Serialized } from '@langchain/core/load/serializable';
import { ChainValues } from '@langchain/core/utils/types';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LLMResult } from '@langchain/core/outputs';
import { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseMessage } from '@langchain/core/messages';

const ASSOCIATION_PROPERTIES_KEY = Symbol('association_properties');
const _SUPPRESS_INSTRUMENTATION_KEY = Symbol('suppress-instrumentation');

class SpanHolder {
  span: Span;
  children: string[];
  startTime: number;
  requestModel?: string;

  constructor(span: Span, children: string[] = [], requestModel?: string) {
    this.span = span;
    this.children = children;
    this.startTime = Date.now();
    this.requestModel = requestModel;
  }
}

function _setReqParamsFromSerial(
  span: Span,
  serialized: Serialized,
  spanHolder: SpanHolder
): void {
  if (serialized && 'kwargs' in serialized) {
    const model_id = serialized['kwargs']['model_id'];
    const temperature = serialized['kwargs']['temperature'];
    const max_tokens = serialized['kwargs']['max_tokens'];
    const stop_sequences = serialized['kwargs']['stop_sequences'];
    const top_p = serialized['kwargs']['top_p'];

    spanHolder.requestModel = model_id;

    _setSpanAttribute(span, Span_Attributes.GEN_AI_REQUEST_MODEL, model_id);
    _setSpanAttribute(span, Span_Attributes.GEN_AI_RESPONSE_MODEL, model_id);
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_REQUEST_TEMPERATURE,
      temperature
    );
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_REQUEST_MAX_TOKENS,
      max_tokens
    );
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_REQUEST_STOP_SEQUENCES,
      stop_sequences
    );
    _setSpanAttribute(span, Span_Attributes.GEN_AI_REQUEST_TOP_P, top_p);
  }

  if (serialized && serialized['id']) {
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_SYSTEM,
      serialized['id'][serialized['id'].length - 1]
    );
  }
}

function _setReqParamFromLS(
  span: Span,
  metadata: Record<string, any>,
  spanHolder: SpanHolder
): void {
  if (metadata) {
    const model_id = metadata.ls_model_name;
    const temperature = metadata.ls_temperature;
    const max_tokens = metadata.ls_max_tokens;
    const provider = metadata.ls_provider;
    const model_type = metadata.model_type;

    spanHolder.requestModel = model_id;
    _setSpanAttribute(span, Span_Attributes.GEN_AI_REQUEST_MODEL, model_id);
    _setSpanAttribute(span, Span_Attributes.GEN_AI_RESPONSE_MODEL, model_id);
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_REQUEST_TEMPERATURE,
      temperature
    );
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_REQUEST_MAX_TOKENS,
      max_tokens
    );
    _setSpanAttribute(span, Span_Attributes.GEN_AI_SYSTEM, provider);
    _setSpanAttribute(span, Span_Attributes.GEN_AI_OPERATION_NAME, model_type);
  }
}

function _getNameFromCallback(
  serialized: Serialized,
  extraParams?: Record<string, any>,
  metadata?: Record<string, any>
): any {
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
}

function _setSpanAttribute(span: Span, name: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') {
    span.setAttribute(name, value);
  }
}

function _sanitizeMetadataValue(value: any): any {
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
    return value.map(v => String(_sanitizeMetadataValue(v)));
  }

  return String(value);
}

export class OpenTelemetryCallbackHandler extends BaseCallbackHandler {
  public tracer: Tracer;
  public spanMapping: Map<string, SpanHolder> = new Map();
  name = 'opentelemetry-callback-handler';

  constructor(tracer: Tracer) {
    super();
    this.tracer = tracer;
  }

  private _endSpan(span: Span, runId: string): void {
    const spanHolder = this.spanMapping.get(runId);
    if (spanHolder) {
      for (const childId of spanHolder.children) {
        const childSpanHolder = this.spanMapping.get(childId);
        if (childSpanHolder) {
          childSpanHolder.span.end();
          this.spanMapping.delete(childId);
        }
      }
      span.end();
    }
  }

  private _createSpan(
    runId: string,
    parentRunId: string | undefined,
    spanName: string,
    kind: SpanKind = SpanKind.INTERNAL,
    metadata?: Record<string, any>
  ): Span {
    metadata = metadata || {};

    if (metadata !== null) {
      const currentAssociationProperties = (context
        .active()
        .getValue(ASSOCIATION_PROPERTIES_KEY) || {}) as Record<string, any>;
      const sanitizedMetadata = {};

      for (const [k, v] of Object.entries(metadata)) {
        if (v !== null && v !== undefined) {
          sanitizedMetadata[k] = _sanitizeMetadataValue(v);
        }
      }

      context.active().setValue(ASSOCIATION_PROPERTIES_KEY, {
        currentAssociationProperties,
        sanitizedMetadata,
      });
    }

    let span: Span;
    if (parentRunId && this.spanMapping.has(parentRunId)) {
      const parentSpan = this.spanMapping.get(parentRunId)!.span;
      const ctx = trace.setSpan(context.active(), parentSpan);
      span = this.tracer.startSpan(spanName, { kind }, ctx);
    } else {
      span = this.tracer.startSpan(spanName, { kind });
    }

    let modelId = 'unknown';

    if (metadata.ls_model_name) {
      modelId = metadata.ls_model_name;
    }

    this.spanMapping.set(runId, new SpanHolder(span, [], modelId));

    if (parentRunId && this.spanMapping.has(parentRunId)) {
      this.spanMapping.get(parentRunId)!.children.push(runId);
    }

    return span;
  }

  private _handleError(
    error: Error,
    runId: string,
    parentRunId?: string,
    kwargs: Record<string, any> = {}
  ): void {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    if (!this.spanMapping.has(runId)) {
      return;
    }

    const span = this.spanMapping.get(runId)!.span;
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    this._endSpan(span, runId);
  }

  async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    const name = _getNameFromCallback(llm, extraParams, metadata);

    const spanName = GenAIOperationValues.CHAT + ' ' + name;
    const span = this._createSpan(
      runId,
      parentRunId,
      spanName,
      SpanKind.CLIENT,
      metadata
    );

    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_OPERATION_NAME,
      GenAIOperationValues.CHAT
    );
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_SYSTEM,
      GenAIOperationValues.UNKNOWN
    );
    if (llm && 'kwargs' in llm) {
      _setReqParamsFromSerial(span, llm, this.spanMapping.get(runId)!);
    }
    if (metadata && Object.keys(metadata).length > 0) {
      _setReqParamFromLS(span, metadata, this.spanMapping.get(runId)!);
    }
  }

  async handleLLMStart(
    llm: Serialized,
    prompt: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }
    const name = _getNameFromCallback(llm, extraParams, metadata);
    const spanName = GenAIOperationValues.CHAT + ' ' + name;
    const span = this._createSpan(
      runId,
      parentRunId,
      spanName,
      SpanKind.CLIENT,
      metadata
    );

    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_SYSTEM,
      GenAIOperationValues.UNKNOWN
    );
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_OPERATION_NAME,
      GenAIOperationValues.TEXT_COMPLETION
    );

    if (llm) {
      _setReqParamsFromSerial(span, llm, this.spanMapping.get(runId)!);
    }
    if (metadata && Object.keys(metadata).length > 0) {
      _setReqParamFromLS(span, metadata, this.spanMapping.get(runId)!);
    }
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }
    const span = this.spanMapping.get(runId)!.span;

    if (output.generations) {
      const generation = output.generations[0][0] as any;
      const message = generation.message;

      if (message && typeof message === 'object') {
        if (message.usage_metadata) {
          const inputTokens = message.usage_metadata.input_tokens;
          const outputTokens = message.usage_metadata.output_tokens;
          _setSpanAttribute(
            span,
            Span_Attributes.GEN_AI_USAGE_INPUT_TOKENS,
            inputTokens
          );
          _setSpanAttribute(
            span,
            Span_Attributes.GEN_AI_USAGE_OUTPUT_TOKENS,
            outputTokens
          );
        }
        if (message.id) {
          const response_id = message.id;
          _setSpanAttribute(
            span,
            Span_Attributes.GEN_AI_RESPONSE_ID,
            response_id
          );
        }
      }
    }
    this._endSpan(span, runId);
  }

  async handleLLMError(
    err: any,
    runId: string,
    parentRunId?: string
  ): Promise<any> {
    this._handleError(err, runId, parentRunId);
  }

  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string
  ): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    let name = runType;
    if (name === undefined && chain.id) {
      name = chain.id[chain.id.length - 1];
    }

    const spanName = `chain ${name}`;
    const span = this._createSpan(
      runId,
      parentRunId,
      spanName,
      SpanKind.INTERNAL,
      metadata
    );

    const spanContext = trace.setSpan(context.active(), span);
    if (metadata && metadata.agent_name) {
      _setSpanAttribute(
        span,
        Span_Attributes.GEN_AI_AGENT_NAME,
        metadata.agent_name
      );
    }
    _setSpanAttribute(span, 'gen_ai.prompt', JSON.stringify(inputs, null, 2));
  }

  async handleChainEnd(outputs: ChainValues, runId: string): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    if (!this.spanMapping.has(runId)) {
      return;
    }

    const spanHolder = this.spanMapping.get(runId)!;
    const span = spanHolder.span;

    _setSpanAttribute(
      span,
      'gen_ai.completion',
      JSON.stringify(outputs, null, 2)
    );
    this._endSpan(span, runId);
  }

  async handleChainError(
    err: any,
    runId: string,
    parentRunId?: string
  ): Promise<any> {
    this._handleError(err, runId, parentRunId);
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    let name;
    if (name === undefined && tool.id) {
      name = tool.id[tool.id.length - 1];
    }
    const spanName = `execute_tool ${name}`;
    const span = this._createSpan(
      runId,
      parentRunId,
      spanName,
      SpanKind.INTERNAL,
      metadata
    );

    _setSpanAttribute(span, 'gen_ai.tool.input', input);

    if (tool.id) {
      _setSpanAttribute(span, Span_Attributes.GEN_AI_TOOL_CALL_ID, tool.id);
    }

    _setSpanAttribute(span, Span_Attributes.GEN_AI_TOOL_NAME, name);
    _setSpanAttribute(
      span,
      Span_Attributes.GEN_AI_OPERATION_NAME,
      GenAIOperationValues.EXECUTE_TOOL
    );
  }

  async handleToolEnd(output: any, runId: string): Promise<any> {
    if (context.active().getValue(_SUPPRESS_INSTRUMENTATION_KEY)) {
      return;
    }

    if (!this.spanMapping.has(runId)) {
      return;
    }
    const span = this.spanMapping.get(runId)!.span;

    if (output['kwargs']) {
      const content = output['kwargs']['content'];
      const call_id = output['kwargs']['tool_call_id'];
      _setSpanAttribute(span, 'gen_ai.tool.output', content);
      _setSpanAttribute(span, Span_Attributes.GEN_AI_TOOL_CALL_ID, call_id);
    }
    this._endSpan(span, runId);
  }

  async handleToolError(
    err: any,
    runId: string,
    parentRunId?: string
  ): Promise<any> {
    this._handleError(err, runId, parentRunId, {});
  }

  async handleAgentAction(action: AgentAction, runId: string): Promise<void> {
    const tool = action.tool;
    const toolInput = action.toolInput;

    if (this.spanMapping.has(runId)) {
      const span = this.spanMapping.get(runId).span;

      _setSpanAttribute(span, 'gen_ai.agent.tool.input', toolInput);
      _setSpanAttribute(span, 'gen_ai.agent.tool.name', tool);
      _setSpanAttribute(
        span,
        Span_Attributes.GEN_AI_OPERATION_NAME,
        GenAIOperationValues.INVOKE_AGENT
      );
    }
  }

  async handleAgentEnd(action: AgentFinish, runId: string): Promise<void> {
    if (this.spanMapping.has(runId)) {
      const span = this.spanMapping.get(runId).span;
      _setSpanAttribute(
        span,
        'gen_ai.agent.tool.output',
        action.returnValues.output
      );
    }
  }
}
