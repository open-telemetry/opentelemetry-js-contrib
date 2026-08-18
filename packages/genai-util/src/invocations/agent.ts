/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanStatusCode,
  type Attributes,
  type HrTime,
  type Span,
} from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_ID,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_AGENT_VERSION,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '../semconv';
import type {
  AgentInvocationOptions,
  CompletionResult,
  InputMessages,
  OutputMessages,
  RemoteAgentInvocationOptions,
  SystemInstruction,
  TokenUsage,
} from '../types';
import {
  calculateDurationSeconds,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
} from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';

/**
 * Manages the lifecycle and telemetry of an Agent invocation (local or remote).
 */
export class AgentInvocation {
  private readonly _span: Span;
  private readonly _handler?: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _providerName?: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _agentName?: string;
  private _agentId?: string;
  private _agentDescription?: string;
  private _agentVersion?: string;
  private _conversationId?: string;
  private _dataSourceId?: string;
  private _outputType?: string;
  private _usage?: TokenUsage;
  private _finishReasons?: string[];
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstruction;
  private _firstChunkTime?: HrTime;
  private _customAttributes: Attributes = {};
  private _isEnded = false;

  constructor(
    span: Span,
    handler?: TelemetryHandler,
    options?: AgentInvocationOptions | RemoteAgentInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._providerName = (
      options as RemoteAgentInvocationOptions
    )?.providerName;
    this._requestModel = options?.requestModel;
    this._serverAddress = (
      options as RemoteAgentInvocationOptions
    )?.serverAddress;
    this._serverPort = (options as RemoteAgentInvocationOptions)?.serverPort;
    this._agentName = options?.agentName;
    this._agentId = options?.agentId;
    this._agentDescription = options?.agentDescription;
    this._agentVersion = options?.agentVersion;
    this._conversationId = options?.conversationId;
    this._dataSourceId = options?.dataSourceId;
    this._outputType = options?.outputType;

    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      ...options?.attributes,
    };

    if (this._providerName) {
      attrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._agentId) {
      attrs[ATTR_GEN_AI_AGENT_ID] = this._agentId;
    }
    if (this._agentName) {
      attrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._agentDescription) {
      attrs[ATTR_GEN_AI_AGENT_DESCRIPTION] = this._agentDescription;
    }
    if (this._agentVersion) {
      attrs[ATTR_GEN_AI_AGENT_VERSION] = this._agentVersion;
    }
    if (this._conversationId) {
      attrs[ATTR_GEN_AI_CONVERSATION_ID] = this._conversationId;
    }
    if (this._dataSourceId) {
      attrs[ATTR_GEN_AI_DATA_SOURCE_ID] = this._dataSourceId;
    }
    if (this._outputType) {
      attrs[ATTR_GEN_AI_OUTPUT_TYPE] = this._outputType;
    }
    if (this._serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = this._serverPort;
    }

    const reqOpts = options?.requestOptions;
    if (reqOpts) {
      if (reqOpts.temperature !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = reqOpts.temperature;
      }
      if (reqOpts.topP !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_P] = reqOpts.topP;
      }
      if (reqOpts.topK !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_K] = reqOpts.topK;
      }
      if (reqOpts.maxTokens !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = reqOpts.maxTokens;
      }
      if (reqOpts.stopSequences && reqOpts.stopSequences.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = reqOpts.stopSequences;
      }
      if (reqOpts.frequencyPenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = reqOpts.frequencyPenalty;
      }
      if (reqOpts.presencePenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = reqOpts.presencePenalty;
      }
      if (reqOpts.choiceCount !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_CHOICE_COUNT] = reqOpts.choiceCount;
      }
      if (reqOpts.seed !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_SEED] = reqOpts.seed;
      }
      if (reqOpts.encodingFormats && reqOpts.encodingFormats.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = reqOpts.encodingFormats;
      }
    }

    if (options?.systemInstructions) {
      this.setSystemInstructions(options.systemInstructions);
    }
    if (options?.inputMessages && options.inputMessages.length > 0) {
      this.addInputMessages(options.inputMessages);
    }

    this._span.setAttributes(attrs);
  }

  public setAgentId(agentId: string): this {
    this._agentId = agentId;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_ID, agentId);
    return this;
  }

  public getAgentId(): string | undefined {
    return this._agentId;
  }

  public setAgentName(agentName: string): this {
    this._span.setAttribute(ATTR_GEN_AI_AGENT_NAME, agentName);
    return this;
  }

  public getAgentName(): string | undefined {
    return this._agentName;
  }

  public setAgentDescription(agentDescription: string): this {
    this._agentDescription = agentDescription;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_DESCRIPTION, agentDescription);
    return this;
  }

  public getAgentDescription(): string | undefined {
    return this._agentDescription;
  }

  public setAgentVersion(agentVersion: string): this {
    this._agentVersion = agentVersion;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_VERSION, agentVersion);
    return this;
  }

  public getAgentVersion(): string | undefined {
    return this._agentVersion;
  }

  public setConversationId(conversationId: string): this {
    this._conversationId = conversationId;
    this._span.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, conversationId);
    return this;
  }

  public getConversationId(): string | undefined {
    return this._conversationId;
  }

  public setDataSourceId(dataSourceId: string): this {
    this._dataSourceId = dataSourceId;
    this._span.setAttribute(ATTR_GEN_AI_DATA_SOURCE_ID, dataSourceId);
    return this;
  }

  public getDataSourceId(): string | undefined {
    return this._dataSourceId;
  }

  public setOutputType(outputType: string): this {
    this._outputType = outputType;
    this._span.setAttribute(ATTR_GEN_AI_OUTPUT_TYPE, outputType);
    return this;
  }

  public getOutputType(): string | undefined {
    return this._outputType;
  }

  public setFinishReasons(reasons: string[] | string): this {
    const arr = Array.isArray(reasons) ? reasons : [reasons];
    this._finishReasons = arr;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, arr);
    return this;
  }

  public getFinishReasons(): string[] | undefined {
    return this._finishReasons;
  }

  public setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    if (usage.outputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
        usage.outputTokens
      );
    }
    if (usage.reasoningTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
        usage.reasoningTokens
      );
    }
    if (usage.cacheReadTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
        usage.cacheReadTokens
      );
    }
    if (usage.cacheCreationTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
        usage.cacheCreationTokens
      );
    }
    return this;
  }

  public getUsage(): TokenUsage | undefined {
    return this._usage;
  }

  public addInputMessages(messages: InputMessages): this {
    this._inputMessages = [...(this._inputMessages ?? []), ...messages];
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (isSpanContentCaptureEnabled(mode)) {
      const formatted = formatInputMessages(this._inputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, formatted);
      }
    }
    return this;
  }

  public addOutputMessages(messages: OutputMessages): this {
    this._outputMessages = [...(this._outputMessages ?? []), ...messages];
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (isSpanContentCaptureEnabled(mode)) {
      const formatted = formatOutputMessages(this._outputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, formatted);
      }
    }
    return this;
  }

  public setSystemInstructions(instructions: SystemInstruction): this {
    this._systemInstructions = instructions;
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (isSpanContentCaptureEnabled(mode)) {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._customAttributes[key] = value;
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    Object.assign(this._customAttributes, attributes);
    this._span.setAttributes(attributes);
    return this;
  }

  /**
   * Set time to first chunk in seconds for streaming responses.
   */
  public setTimeToFirstChunk(seconds: number): this {
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, seconds);
    return this;
  }

  /**
   * Helper for stream chunks recording. On first chunk, marks stream request and records TTFT metric.
   */
  public recordStreamChunk(_chunk?: unknown): this {
    if (!this._firstChunkTime) {
      this._firstChunkTime = process.hrtime();
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
      const ttftSec = calculateDurationSeconds(
        this._startTime,
        this._firstChunkTime
      );
      this._span.setAttribute(
        ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
        ttftSec
      );
      if (this._handler) {
        const metricAttrs: Attributes = {
          [ATTR_GEN_AI_OPERATION_NAME]:
            GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
        };
        if (this._providerName) {
          metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
        }
        if (this._requestModel) {
          metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
        }
        if (this._serverAddress) {
          metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
        }
        if (this._serverPort !== undefined) {
          metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
        }

        this._handler.recordServerTimeToFirstToken(ttftSec, metricAttrs);
      }
    }
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);

    this._runCompletionHook(durationSec);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec, error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'GenAI agent error';

    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });
    this._span.end(endHr);

    this._runCompletionHook(durationSec, error);
  }

  private _recordMetrics(durationSec: number, error?: unknown): void {
    if (!this._handler) {
      return;
    }
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    if (error) {
      metricAttrs[ATTR_ERROR_TYPE] = getErrorType(error);
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);
    if (this._usage) {
      this._handler.recordTokenUsage(this._usage, metricAttrs);
    }
  }

  private _runCompletionHook(durationSec: number, error?: unknown): void {
    if (!this._handler) {
      return;
    }
    const result: CompletionResult = {
      span: this._span,
      providerName: this._providerName,
      operationName: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      requestModel: this._requestModel,
      finishReasons: this._finishReasons,
      usage: this._usage,
      durationSeconds: durationSec,
      inputMessages: this._inputMessages,
      outputMessages: this._outputMessages,
      systemInstructions: this._systemInstructions,
      error,
      attributes: this._customAttributes,
    };

    void this._handler
      .getCompletionHookManager()
      .execute(result, this._handler.getDiag());
  }

  public getSpan(): Span {
    return this._span;
  }
}
