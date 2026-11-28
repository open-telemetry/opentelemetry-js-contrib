/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, createContextKey } from '@opentelemetry/api';
import type { Context, DiagLogger, TimeInput } from '@opentelemetry/api';
import type { TelemetryHandler, ToolInvocation } from '@opentelemetry/genai-util';
import { toInvocationError, toRunInvocationError } from './errors';
import {
  extractAgentTools,
  extractCallId,
  extractGenerationTelemetry,
  extractResponseTelemetry,
  nonEmptyString,
  type ModelCallTelemetry,
} from './extractors';
import type {
  OpenAIAgentsAgentLike,
  OpenAIAgentsSpan,
  OpenAIAgentsToolCallDetails,
  OpenAIAgentsToolLike,
  OpenAIAgentsTrace,
  OpenAIAgentsTracingProcessor as OpenAIAgentsTracingProcessorApi,
} from './internal-types';
import {
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TRANSFER_MODE,
  ATTR_GEN_AI_TRANSFER_TARGET_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL,
  GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER,
  type InvocationError,
  type LocalAgentInvocation,
  type LocalAgentRequestOptions,
  type OutputMessages,
  type ToolDefinitions,
} from './semconv';

type OpenAIAgentsInvocation = LocalAgentInvocation | ToolInvocation;

const DEFAULT_SDK_TRACE_NAME = 'Agent workflow';

interface AgentMetadata {
  description?: string;
  model?: string;
  toolDescriptions: Map<string, string>;
  toolDefinitions?: ToolDefinitions;
}

interface BaseSpanRecord {
  context: Context;
  conversationId?: string;
  agentName?: string;
  runToken?: object;
  pendingError?: InvocationError;
  errorTarget?: SpanRecord | TraceRecord;
}

interface AgentSpanRecord extends BaseSpanRecord {
  kind: 'agent';
  invocation: LocalAgentInvocation;
  outerAgent?: AgentSpanRecord;
  subtractUsageFromOuter: boolean;
  hasAgentMetadata: boolean;
  hasRequestModel: boolean;
  hasRequestParams: boolean;
  hasCapturedInput: boolean;
  latestOutputMessages?: OutputMessages;
  modelInputTokens?: number;
  modelOutputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  childInputTokens: number;
  childOutputTokens: number;
}

interface ToolSpanRecord extends BaseSpanRecord {
  kind: 'tool';
  toolKind: 'function' | 'handoff';
  invocation: ToolInvocation;
  enclosingAgent?: AgentSpanRecord;
  hasToolDescription?: boolean;
  hasTransferTarget?: boolean;
}

interface PassthroughSpanRecord extends BaseSpanRecord {
  kind: 'passthrough';
  spanType: string;
  enclosingAgent?: AgentSpanRecord;
  enclosingFunctionTool?: ToolSpanRecord;
}

type SpanRecord = AgentSpanRecord | ToolSpanRecord | PassthroughSpanRecord;

interface TraceRecord {
  kind: 'trace';
  context: Context;
  invocation?: LocalAgentInvocation;
  pendingError?: InvocationError;
  trace: OpenAIAgentsTrace;
  conversationId?: string;
  runToken?: object;
  ended?: boolean;
  pendingStream?: boolean;
  endRequested?: boolean;
  pendingEndTime?: TimeInput;
}

export const OPENAI_AGENTS_RUN_CONTEXT_KEY = createContextKey(
  'opentelemetry.instrumentation.openai-agents.run'
);

export const OPENAI_AGENTS_NESTED_RUN_CONTEXT_KEY = createContextKey(
  'opentelemetry.instrumentation.openai-agents.nested-run'
);

export const OPENAI_AGENTS_USER_TRACE_CONTEXT_KEY = createContextKey(
  'opentelemetry.instrumentation.openai-agents.user-trace'
);

export class OpenAIAgentsTracingProcessor
  implements OpenAIAgentsTracingProcessorApi
{
  private _enabled = true;
  private _spanRecords = new WeakMap<object, SpanRecord>();
  private _spanRecordsById = new Map<string, SpanRecord>();
  private _traceRecords = new WeakMap<object, TraceRecord>();
  private _traceRecordsById = new Map<string, TraceRecord>();
  private _traceRecordsByRun = new WeakMap<object, TraceRecord[]>();
  private _pendingStreamRecords = new WeakMap<object, TraceRecord[]>();
  private _agentMetadataByRun = new WeakMap<
    object,
    Map<string, AgentMetadata>
  >();
  private readonly _openInvocations = new Set<OpenAIAgentsInvocation>();

  constructor(
    private readonly _getTelemetryHandler: () => TelemetryHandler,
    private readonly _diag: DiagLogger
  ) {}

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  onAgentMetadata(agent: OpenAIAgentsAgentLike): void {
    this._safely('recording agent metadata', () => {
      const name = nonEmptyString(agent.name);
      const runToken = this._activeRunToken();
      if (!name || !runToken) {
        return;
      }
      const includeDefinitions =
        this._getTelemetryHandler().getContentCaptureMode() === 'span_only';
      const { toolDescriptions, toolDefinitions } = extractAgentTools(
        agent.tools,
        includeDefinitions
      );
      let byName = this._agentMetadataByRun.get(runToken);
      if (!byName) {
        byName = new Map<string, AgentMetadata>();
        this._agentMetadataByRun.set(runToken, byName);
      }
      byName.set(name, {
        description: nonEmptyString(agent.handoffDescription),
        model: nonEmptyString(agent.model),
        toolDescriptions,
        toolDefinitions,
      });
    });
  }

  onToolCallMetadata(
    spanId: string | undefined,
    tool: OpenAIAgentsToolLike | undefined,
    details: OpenAIAgentsToolCallDetails | undefined
  ): void {
    this._safely('recording tool call metadata', () => {
      if (!spanId) {
        return;
      }
      const record = this._spanRecordsById.get(spanId);
      if (!record || record.kind !== 'tool' || record.toolKind !== 'function') {
        return;
      }
      const callId = extractCallId(details?.toolCall);
      if (callId) {
        record.invocation.setAttribute(ATTR_GEN_AI_TOOL_CALL_ID, callId);
      }
      if (!record.hasToolDescription) {
        const description = nonEmptyString(tool?.description);
        if (description) {
          record.invocation.setAttribute(
            ATTR_GEN_AI_TOOL_DESCRIPTION,
            description
          );
          record.hasToolDescription = true;
        }
      }
    });
  }

  onTraceStart(trace: OpenAIAgentsTrace): Promise<void> {
    this._safely('starting trace span', () => {
      if (!this._enabled || this._traceRecords.has(trace)) {
        return;
      }

      const active = context.active();
      const runToken = this._activeRunToken();
      const conversationId = nonEmptyString(trace.groupId);
      const isNestedRun =
        active.getValue(OPENAI_AGENTS_NESTED_RUN_CONTEXT_KEY) === true;
      const isUserTrace =
        active.getValue(OPENAI_AGENTS_USER_TRACE_CONTEXT_KEY) === true;

      let invocation: LocalAgentInvocation | undefined;
      let spanContext = active;

      if (isUserTrace || !isNestedRun) {
        const operationName = isUserTrace
          ? GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
          : GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER;
        const rawName = nonEmptyString(trace.name);
        const agentName =
          rawName && rawName !== DEFAULT_SDK_TRACE_NAME ? rawName : undefined;
        invocation = this._getTelemetryHandler().startLocalAgent({
          operationName,
          agentName,
          conversationId,
          parentContext: active,
        });
        spanContext = invocation.getContext();
        this._openInvocations.add(invocation);
      }

      const record: TraceRecord = {
        kind: 'trace',
        context: spanContext,
        invocation,
        trace,
        conversationId,
        runToken,
      };
      this._traceRecords.set(trace, record);
      this._traceRecordsById.set(trace.traceId, record);
      if (runToken) {
        const stack = this._traceRecordsByRun.get(runToken);
        if (stack) {
          stack.push(record);
        } else {
          this._traceRecordsByRun.set(runToken, [record]);
        }
      }
    });
    return Promise.resolve();
  }

  onTraceEnd(trace: OpenAIAgentsTrace): Promise<void> {
    this._safely('ending trace span', () => {
      const record = this._traceRecords.get(trace);
      if (record) {
        this._endTrace(record);
      }
    });
    return Promise.resolve();
  }

  onSpanStart(span: OpenAIAgentsSpan): Promise<void> {
    this._safely('starting span', () => {
      if (!this._enabled || this._spanRecords.has(span)) {
        return;
      }

      const parentRecord = this._parentRecord(span);
      const parentContext = parentRecord?.context || context.active();
      const conversationId =
        parentRecord?.conversationId ??
        this._traceRecordsById.get(span.traceId)?.conversationId;
      const enclosingAgent = this._enclosingAgentOf(parentRecord);
      const enclosingFunctionTool = this._enclosingFunctionToolOf(parentRecord);
      const parentAgentName =
        parentRecord?.kind === 'trace' ? undefined : parentRecord?.agentName;
      const errorTarget =
        parentRecord?.kind === 'trace'
          ? parentRecord
          : parentRecord?.errorTarget;

      const record = this._createSpanRecord({
        span,
        parentContext,
        conversationId,
        parentAgentName,
        enclosingAgent,
        enclosingFunctionTool,
        errorTarget,
      });

      this._spanRecords.set(span, record);
      this._spanRecordsById.set(span.spanId, record);
    });
    return Promise.resolve();
  }

  onSpanEnd(span: OpenAIAgentsSpan): Promise<void> {
    this._safely('ending span', () => {
      const record = this._spanRecords.get(span);
      if (!record) {
        return;
      }

      const endTime = this._asTimeInput(span.endedAt);
      switch (record.kind) {
        case 'tool':
          this._endToolRecord(span, record, endTime);
          break;
        case 'agent':
          this._endAgentRecord(span, record, endTime);
          break;
        case 'passthrough':
          this._endPassthroughRecord(span, record);
          break;
      }

      this._spanRecords.delete(span);
      this._spanRecordsById.delete(span.spanId);
    });
    return Promise.resolve();
  }

  shutdown(_timeout?: number): Promise<void> {
    for (const invocation of [...this._openInvocations].reverse()) {
      invocation.stop();
    }
    this._openInvocations.clear();
    this._spanRecords = new WeakMap<object, SpanRecord>();
    this._spanRecordsById.clear();
    this._traceRecords = new WeakMap<object, TraceRecord>();
    this._traceRecordsById.clear();
    this._traceRecordsByRun = new WeakMap<object, TraceRecord[]>();
    this._pendingStreamRecords = new WeakMap<object, TraceRecord[]>();
    this._agentMetadataByRun = new WeakMap<
      object,
      Map<string, AgentMetadata>
    >();
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  onRunError(runToken: object, error: unknown): void {
    this._safely('ending failed run trace', () => {
      const stack = this._traceRecordsByRun.get(runToken);
      if (!stack?.length) {
        return;
      }
      for (const record of [...stack].reverse()) {
        this._recordRunError(record, error, 'OpenAI Agents run failed');
        this._endTrace(record);
      }
    });
  }

  onRunStreamStart(runToken: object, traceId?: string): void {
    this._safely('tracking streamed run', () => {
      const records = this._runTraceRecords(runToken, traceId);
      if (!records.length) {
        return;
      }
      for (const record of records) {
        record.pendingStream = true;
      }
      this._pendingStreamRecords.set(runToken, records);
    });
  }

  onRunStreamSettled(runToken: object, error?: unknown): void {
    this._safely('completing streamed run', () => {
      const records = this._pendingStreamRecords.get(runToken);
      this._pendingStreamRecords.delete(runToken);
      if (!records?.length) {
        return;
      }
      for (const record of [...records].reverse()) {
        record.pendingStream = false;
        if (error !== undefined) {
          this._recordRunError(record, error, 'OpenAI Agents stream failed');
        }
        if (record.endRequested) {
          this._finishTraceSpan(record, record.pendingEndTime);
        }
      }
    });
  }

  onTraceError(trace: OpenAIAgentsTrace, error: unknown): void {
    this._safely('ending failed trace', () => {
      const record =
        this._traceRecords.get(trace) ??
        this._traceRecordsById.get(trace.traceId);
      if (!record) {
        return;
      }
      this._recordRunError(record, error, 'OpenAI Agents trace failed');
      this._endTrace(record);
    });
  }

  private _createSpanRecord(params: {
    span: OpenAIAgentsSpan;
    parentContext: Context;
    conversationId?: string;
    parentAgentName?: string;
    enclosingAgent?: AgentSpanRecord;
    enclosingFunctionTool?: ToolSpanRecord;
    errorTarget?: SpanRecord | TraceRecord;
  }): SpanRecord {
    const {
      span,
      parentContext,
      conversationId,
      parentAgentName,
      enclosingAgent,
      enclosingFunctionTool,
      errorTarget,
    } = params;
    const data = span.spanData;
    const startTime = this._asTimeInput(span.startedAt);
    const runToken = this._activeRunToken();
    const handler = this._getTelemetryHandler();

    if (data.type === 'agent') {
      const name = nonEmptyString(data.name);
      if (enclosingFunctionTool && !enclosingFunctionTool.hasTransferTarget) {
        enclosingFunctionTool.hasTransferTarget = true;
        this._setTransfer(
          enclosingFunctionTool.invocation,
          GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER,
          name
        );
      }
      const metadata = this._lookupAgentMetadata(name, runToken);
      const rawOutputType = nonEmptyString(data.output_type);
      const outputType =
        rawOutputType && rawOutputType !== 'text'
          ? GEN_AI_OUTPUT_TYPE_VALUE_JSON
          : undefined;
      const invocation = handler.startLocalAgent({
        agentName: name,
        agentDescription: metadata?.description,
        conversationId,
        outputType,
        requestModel: metadata?.model,
        toolDefinitions: metadata?.toolDefinitions,
        trackInferenceCalls: true,
        trackToolCalls: true,
        parentContext,
        startTime,
      });
      this._openInvocations.add(invocation);
      const record: AgentSpanRecord = {
        kind: 'agent',
        context: invocation.getContext(),
        invocation,
        outerAgent: enclosingAgent,
        subtractUsageFromOuter: Boolean(
          enclosingFunctionTool?.hasTransferTarget
        ),
        agentName: name ?? parentAgentName,
        conversationId,
        runToken,
        hasAgentMetadata: Boolean(metadata),
        hasRequestModel: Boolean(metadata?.model),
        hasRequestParams: false,
        hasCapturedInput: false,
        childInputTokens: 0,
        childOutputTokens: 0,
      };
      record.errorTarget = record;
      return record;
    }

    if (data.type === 'function' || data.type === 'handoff') {
      enclosingAgent?.invocation.recordToolCall();
      const started =
        data.type === 'function'
          ? this._startFunctionTool(
              handler,
              data,
              parentContext,
              startTime,
              parentAgentName,
              conversationId
            )
          : this._startHandoffTool(
              handler,
              data,
              parentContext,
              startTime,
              parentAgentName,
              conversationId
            );
      this._openInvocations.add(started.invocation);
      const record: ToolSpanRecord = {
        kind: 'tool',
        toolKind: data.type,
        context: started.invocation.getContext(),
        invocation: started.invocation,
        enclosingAgent,
        hasToolDescription: started.hasToolDescription,
        hasTransferTarget: started.hasTransferTarget,
        agentName: parentAgentName,
        conversationId,
        runToken,
      };
      record.errorTarget = record;
      return record;
    }

    if (data.type === 'generation' || data.type === 'response') {
      enclosingAgent?.invocation.recordInferenceCall();
    }

    return {
      kind: 'passthrough',
      spanType: data.type,
      context: parentContext,
      enclosingAgent,
      enclosingFunctionTool,
      errorTarget,
      agentName: parentAgentName,
      conversationId,
      runToken,
    };
  }

  private _startFunctionTool(
    handler: TelemetryHandler,
    data: OpenAIAgentsSpan['spanData'],
    parentContext: Context,
    startTime: TimeInput | undefined,
    agentName: string | undefined,
    conversationId: string | undefined
  ): {
    invocation: ToolInvocation;
    hasToolDescription?: boolean;
    hasTransferTarget?: boolean;
  } {
    const name = nonEmptyString(data.name) ?? 'unknown';
    const toolDescription = this._lookupAgentMetadata(
      agentName,
      this._activeRunToken()
    )?.toolDescriptions.get(name);
    const invocation = handler.startTool({
      toolName: name,
      toolType: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
      toolDescription,
      agentName,
      conversationId,
      parentContext,
      startTime,
    });
    return { invocation, hasToolDescription: Boolean(toolDescription) };
  }

  private _startHandoffTool(
    handler: TelemetryHandler,
    data: OpenAIAgentsSpan['spanData'],
    parentContext: Context,
    startTime: TimeInput | undefined,
    agentName: string | undefined,
    conversationId: string | undefined
  ): {
    invocation: ToolInvocation;
    hasToolDescription?: boolean;
    hasTransferTarget?: boolean;
  } {
    const toAgent = nonEmptyString(data.to_agent);
    const fromAgent = nonEmptyString(data.from_agent) ?? agentName;
    const invocation = handler.startTool({
      toolName: toAgent ? `transfer_to_${toAgent}` : 'handoff',
      toolType: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
      agentName: fromAgent,
      conversationId,
      parentContext,
      startTime,
    });
    this._setTransfer(
      invocation,
      GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL,
      toAgent
    );
    return { invocation, hasTransferTarget: Boolean(toAgent) };
  }

  private _endToolRecord(
    span: OpenAIAgentsSpan,
    record: ToolSpanRecord,
    endTime: TimeInput | undefined
  ): void {
    if (record.toolKind === 'function') {
      if (
        span.spanData.input !== undefined &&
        record.invocation.shouldCaptureContent()
      ) {
        const serialized = this._serializeToolArguments(span.spanData.input);
        if (serialized) {
          record.invocation.setAttribute(
            ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
            serialized
          );
        }
      }
      if (!span.error && span.spanData.output !== undefined) {
        record.invocation.setResult(span.spanData.output);
      }
    } else if (!record.hasTransferTarget) {
      const toAgent = nonEmptyString(span.spanData.to_agent);
      if (toAgent) {
        record.hasTransferTarget = true;
        this._setTransfer(
          record.invocation,
          GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL,
          toAgent
        );
      }
    }
    this._completeInvocation(span, record, endTime);
  }

  private _endAgentRecord(
    span: OpenAIAgentsSpan,
    record: AgentSpanRecord,
    endTime: TimeInput | undefined
  ): void {
    this._backfillAgentMetadata(record);
    if (record.latestOutputMessages) {
      record.invocation.addOutputMessages(record.latestOutputMessages);
    }
    this._finalizeAgentUsage(record);
    this._completeInvocation(span, record, endTime);
  }

  private _completeInvocation(
    span: OpenAIAgentsSpan,
    record: AgentSpanRecord | ToolSpanRecord,
    endTime: TimeInput | undefined
  ): void {
    const failure = span.error
      ? toInvocationError(span.error)
      : record.pendingError;
    if (failure) {
      record.invocation.fail(failure, endTime);
    } else {
      record.invocation.stop(endTime);
    }
    this._openInvocations.delete(record.invocation);
  }

  private _endPassthroughRecord(
    span: OpenAIAgentsSpan,
    record: PassthroughSpanRecord
  ): void {
    const agent = record.enclosingAgent;
    if (record.spanType === 'turn' && agent && span.spanData.usage) {
      const { input_tokens, output_tokens } = span.spanData.usage;
      if (typeof input_tokens === 'number' && input_tokens >= 0) {
        agent.inputTokens = (agent.inputTokens ?? 0) + input_tokens;
      }
      if (typeof output_tokens === 'number' && output_tokens >= 0) {
        agent.outputTokens = (agent.outputTokens ?? 0) + output_tokens;
      }
    } else if (record.spanType === 'generation' && agent) {
      this._applyModelCallTelemetry(
        agent,
        extractGenerationTelemetry(
          span.spanData,
          agent.invocation.shouldCaptureContent()
        )
      );
    } else if (record.spanType === 'response' && agent) {
      this._applyModelCallTelemetry(
        agent,
        extractResponseTelemetry(
          span.spanData,
          agent.invocation.shouldCaptureContent()
        )
      );
    }

    if (
      span.error &&
      record.errorTarget &&
      this._propagatesError(span, record)
    ) {
      const invocationError = toInvocationError(span.error);
      if (record.errorTarget.kind === 'trace') {
        if (record.spanType === 'task' || !record.errorTarget.pendingError) {
          record.errorTarget.pendingError = invocationError;
        }
      } else if (!record.errorTarget.pendingError) {
        record.errorTarget.pendingError = invocationError;
      }
    }
  }

  private _applyModelCallTelemetry(
    agent: AgentSpanRecord,
    telemetry: ModelCallTelemetry
  ): void {
    if (telemetry.requestModel) {
      agent.invocation.setRequestModel(telemetry.requestModel);
      agent.hasRequestModel = true;
    }
    if (telemetry.responseModel) {
      agent.invocation.setAttribute(
        ATTR_GEN_AI_RESPONSE_MODEL,
        telemetry.responseModel
      );
    }
    if (!agent.hasRequestParams && telemetry.requestOptions) {
      this._applyRequestOptions(agent.invocation, telemetry.requestOptions);
      agent.hasRequestParams = true;
    }
    if (telemetry.finishReasons) {
      agent.invocation.setFinishReasons(telemetry.finishReasons);
    }
    if (telemetry.inputTokens !== undefined) {
      agent.modelInputTokens =
        (agent.modelInputTokens ?? 0) + telemetry.inputTokens;
    }
    if (telemetry.outputTokens !== undefined) {
      agent.modelOutputTokens =
        (agent.modelOutputTokens ?? 0) + telemetry.outputTokens;
    }
    if (telemetry.systemInstructions) {
      agent.invocation.setSystemInstructions(telemetry.systemInstructions);
    }
    if (!agent.hasCapturedInput && telemetry.inputMessages) {
      agent.invocation.addInputMessages(telemetry.inputMessages);
      agent.hasCapturedInput = true;
    }
    if (telemetry.outputMessages) {
      agent.latestOutputMessages = telemetry.outputMessages;
    }
  }

  private _lookupAgentMetadata(
    name: string | undefined,
    runToken: object | undefined
  ): AgentMetadata | undefined {
    if (!name || !runToken) {
      return undefined;
    }
    return this._agentMetadataByRun.get(runToken)?.get(name);
  }

  private _backfillAgentMetadata(record: AgentSpanRecord): void {
    if (record.hasAgentMetadata || !record.agentName) {
      return;
    }
    const metadata = this._lookupAgentMetadata(
      record.agentName,
      record.runToken
    );
    if (!metadata) {
      return;
    }
    record.hasAgentMetadata = true;
    if (metadata.description) {
      record.invocation.setAgentDescription(metadata.description);
    }
    if (!record.hasRequestModel && metadata.model) {
      record.invocation.setRequestModel(metadata.model);
      record.hasRequestModel = true;
    }
    if (metadata.toolDefinitions) {
      record.invocation.setToolDefinitions(metadata.toolDefinitions);
    }
  }

  private _finalizeAgentUsage(record: AgentSpanRecord): void {
    if (
      record.modelInputTokens !== undefined ||
      record.modelOutputTokens !== undefined
    ) {
      record.invocation.setUsage({
        inputTokenCount: record.modelInputTokens,
        outputTokenCount: record.modelOutputTokens,
      });
      return;
    }
    if (record.inputTokens === undefined && record.outputTokens === undefined) {
      return;
    }
    const ownInput =
      record.inputTokens !== undefined
        ? Math.max(0, record.inputTokens - record.childInputTokens)
        : undefined;
    const ownOutput =
      record.outputTokens !== undefined
        ? Math.max(0, record.outputTokens - record.childOutputTokens)
        : undefined;
    record.invocation.setUsage({
      inputTokenCount: ownInput,
      outputTokenCount: ownOutput,
    });
    if (record.outerAgent && record.subtractUsageFromOuter) {
      if (record.inputTokens !== undefined) {
        record.outerAgent.childInputTokens += record.inputTokens;
      }
      if (record.outputTokens !== undefined) {
        record.outerAgent.childOutputTokens += record.outputTokens;
      }
    }
  }

  private _enclosingAgentOf(
    parent: SpanRecord | TraceRecord | undefined
  ): AgentSpanRecord | undefined {
    if (!parent || parent.kind === 'trace') {
      return undefined;
    }
    return parent.kind === 'agent' ? parent : parent.enclosingAgent;
  }

  private _enclosingFunctionToolOf(
    parent: SpanRecord | TraceRecord | undefined
  ): ToolSpanRecord | undefined {
    if (!parent || parent.kind === 'trace' || parent.kind === 'agent') {
      return undefined;
    }
    if (parent.kind === 'tool') {
      return parent.toolKind === 'function' ? parent : undefined;
    }
    return parent.enclosingFunctionTool;
  }

  private _runTraceRecords(runToken: object, traceId?: string): TraceRecord[] {
    const stack = this._traceRecordsByRun.get(runToken);
    if (stack?.length) {
      return [...stack];
    }
    const record = traceId ? this._traceRecordsById.get(traceId) : undefined;
    return record ? [record] : [];
  }

  private _recordRunError(
    record: TraceRecord,
    error: unknown,
    fallbackDetail: string
  ): void {
    if (record.ended || record.pendingError) {
      return;
    }
    record.pendingError = toRunInvocationError(error, fallbackDetail);
  }

  private _parentRecord(
    span: OpenAIAgentsSpan
  ): SpanRecord | TraceRecord | undefined {
    if (span.parentId) {
      const parent = this._spanRecordsById.get(span.parentId);
      if (parent) {
        return parent;
      }
    }
    return this._traceRecordsById.get(span.traceId);
  }

  private _endTrace(record: TraceRecord, endTime?: TimeInput): void {
    if (record.ended) {
      return;
    }
    this._traceRecords.delete(record.trace);
    if (this._traceRecordsById.get(record.trace.traceId) === record) {
      this._traceRecordsById.delete(record.trace.traceId);
    }
    if (record.runToken) {
      const stack = this._traceRecordsByRun.get(record.runToken);
      const index = stack ? stack.indexOf(record) : -1;
      if (stack && index !== -1) {
        stack.splice(index, 1);
        if (!stack.length) {
          this._traceRecordsByRun.delete(record.runToken);
        }
      }
    }
    if (record.pendingStream) {
      record.endRequested = true;
      record.pendingEndTime = endTime;
      return;
    }
    this._finishTraceSpan(record, endTime);
  }

  private _finishTraceSpan(record: TraceRecord, endTime?: TimeInput): void {
    if (record.ended) {
      return;
    }
    record.ended = true;
    if (record.invocation) {
      this._openInvocations.delete(record.invocation);
      if (record.pendingError) {
        record.invocation.fail(record.pendingError, endTime);
      } else {
        record.invocation.stop(endTime);
      }
    }
  }

  private _propagatesError(
    span: OpenAIAgentsSpan,
    record: PassthroughSpanRecord
  ): boolean {
    if (record.spanType === 'turn') {
      return true;
    }
    if (record.spanType !== 'task' || !record.runToken) {
      return record.spanType === 'task';
    }
    return (
      this._traceRecordsById.get(span.traceId)?.runToken === record.runToken
    );
  }

  private _setTransfer(
    invocation: ToolInvocation,
    mode: string,
    targetName?: string
  ): void {
    invocation.setAttribute(ATTR_GEN_AI_TRANSFER_MODE, mode);
    if (targetName) {
      invocation.setAttribute(ATTR_GEN_AI_TRANSFER_TARGET_NAME, targetName);
    }
  }

  private _applyRequestOptions(
    invocation: LocalAgentInvocation,
    options: LocalAgentRequestOptions
  ): void {
    if (options.temperature !== undefined) {
      invocation.setAttribute(
        ATTR_GEN_AI_REQUEST_TEMPERATURE,
        options.temperature
      );
    }
    if (options.topP !== undefined) {
      invocation.setAttribute(ATTR_GEN_AI_REQUEST_TOP_P, options.topP);
    }
    if (options.maxTokens !== undefined) {
      invocation.setAttribute(
        ATTR_GEN_AI_REQUEST_MAX_TOKENS,
        options.maxTokens
      );
    }
    if (options.frequencyPenalty !== undefined) {
      invocation.setAttribute(
        ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
        options.frequencyPenalty
      );
    }
    if (options.presencePenalty !== undefined) {
      invocation.setAttribute(
        ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
        options.presencePenalty
      );
    }
  }

  private _serializeToolArguments(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value || undefined;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  private _activeRunToken(): object | undefined {
    const value = context.active().getValue(OPENAI_AGENTS_RUN_CONTEXT_KEY);
    return typeof value === 'object' && value !== null ? value : undefined;
  }

  private _asTimeInput(
    value: string | null | undefined
  ): TimeInput | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private _safely(description: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this._diag.error(
        `OpenAI Agents instrumentation failed while ${description}`,
        error
      );
    }
  }
}
