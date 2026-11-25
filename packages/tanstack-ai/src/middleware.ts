/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Tracer,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { ChatMiddleware } from '@tanstack/ai';
import {
  TelemetryHandler,
  ToolInvocation,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  type ContentCaptureMode,
} from '@opentelemetry/genai-util';

import {
  INSTRUMENTATION_NAME,
  AGENT_SPAN_NAME,
  DEFAULT_AGENT_NAME,
} from './constants';
import {
  getInputMessages,
  getSystemInstructions,
  getToolDescription,
  initializeToolCall,
  toGenAIOutputMessage,
  toTokenUsageDetails,
  updateToolCallArguments,
  completeToolCall,
} from './converters';
import type {
  OpenTelemetryTanStackAIMiddlewareOptions,
  RequestState,
  UsageInfo,
} from './types';

interface PendingToolExecution {
  requestId: string;
  toolCallId: string;
  invocation: ToolInvocation;
}

// Module-scoped tracking to coordinate tool execute wrapping across concurrent requests
// and across multiple openTelemetryMiddleware instances sharing the same tool objects.
const globalPendingCallsByTool = new WeakMap<object, PendingToolExecution[]>();
const globalOriginalExecutes = new WeakMap<
  object,
  (...args: unknown[]) => unknown
>();

function cleanupPendingForRequest(
  tool: object,
  requestId: string,
  callId?: string
): void {
  const pending = globalPendingCallsByTool.get(tool);
  if (pending) {
    if (callId) {
      const idx = pending.findIndex(
        p => p.requestId === requestId && p.toolCallId === callId
      );
      if (idx !== -1) {
        pending.splice(idx, 1);
      }
    } else {
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].requestId === requestId) {
          pending.splice(i, 1);
        }
      }
    }
    if (pending.length === 0) {
      const originalExecute = globalOriginalExecutes.get(tool);
      if (originalExecute) {
        (tool as { execute?: (...args: unknown[]) => unknown }).execute =
          originalExecute;
        globalOriginalExecutes.delete(tool);
      }
      globalPendingCallsByTool.delete(tool);
    }
  }
}

/**
 * Creates an OpenTelemetry middleware for TanStack AI that emits spans
 * conforming to OpenTelemetry Generative AI semantic conventions.
 */
export function openTelemetryMiddleware(
  options: OpenTelemetryTanStackAIMiddlewareOptions = {}
): ChatMiddleware {
  const contentCaptureMode: ContentCaptureMode | undefined =
    options.captureContent === true
      ? 'span_only'
      : options.captureContent === false
        ? 'none'
        : undefined;

  const handler = new TelemetryHandler({
    instrumentationName: INSTRUMENTATION_NAME,
    instrumentationVersion: '0.1.0',
    tracerProvider: options.tracerProvider,
    contentCaptureMode,
  });

  const tracer: Tracer =
    options.tracer ??
    options.tracerProvider?.getTracer(INSTRUMENTATION_NAME, '0.1.0') ??
    trace.getTracer(INSTRUMENTATION_NAME, '0.1.0');

  const agentName = options.agentName ?? DEFAULT_AGENT_NAME;
  const requestStates = new Map<string, RequestState>();

  function endCurrentLLM(
    state: RequestState,
    status: { code: SpanStatusCode; message?: string },
    usage?: UsageInfo,
    finishReason?: string | null,
    error?: Error
  ) {
    const currentLLM = state.currentLLM;
    if (!currentLLM) {
      return;
    }

    if (usage) {
      const usageDetails = toTokenUsageDetails(usage);
      if (usageDetails) {
        currentLLM.invocation.setUsage(usageDetails);
      }
    }

    if (finishReason) {
      currentLLM.invocation.setFinishReasons([finishReason]);
    }

    const outputMsg = toGenAIOutputMessage(
      currentLLM.outputText,
      Array.from(currentLLM.outputToolCalls.values())
    );
    if (outputMsg) {
      currentLLM.invocation.addOutputMessages([outputMsg]);
    }

    if (error) {
      currentLLM.invocation.fail({
        exception: error,
        statusDescription: error.message,
      });
    } else if (status.code === SpanStatusCode.ERROR) {
      currentLLM.invocation.fail({
        statusDescription: status.message ?? 'Model call failed',
      });
    } else {
      currentLLM.invocation.stop();
    }

    state.currentLLM = undefined;
  }

  function endAllToolSpansWithError(
    toolInvocations: Map<string, ToolInvocation>,
    message: string
  ) {
    toolInvocations.forEach(inv => {
      inv.fail({
        statusDescription: message,
      });
    });
    toolInvocations.clear();
  }

  return {
    name: INSTRUMENTATION_NAME,

    onStart(ctx) {
      if (isTracingSuppressed(context.active())) {
        return;
      }

      const conversationId =
        ctx.conversationId ??
        (ctx as unknown as { threadId?: string }).threadId;

      const attributes: Record<string, unknown> = {
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
        [ATTR_GEN_AI_AGENT_NAME]: agentName,
        'tanstack.ai.request.id': ctx.requestId,
        'tanstack.ai.stream.id': ctx.streamId,
        'tanstack.ai.source': ctx.source,
        'tanstack.ai.streaming': ctx.streaming,
      };

      if (conversationId) {
        attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversationId;
      }

      const chatSpan = tracer.startSpan(AGENT_SPAN_NAME, {
        kind: SpanKind.INTERNAL,
        attributes,
      });

      requestStates.set(ctx.requestId, {
        chatSpan,
        toolInvocations: new Map(),
        toolsByCallId: new Map(),
      });
    },

    onConfig(ctx, config) {
      if (
        ctx.phase !== 'beforeModel' ||
        isTracingSuppressed(context.active())
      ) {
        return;
      }

      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }

      if (state.currentLLM) {
        endCurrentLLM(state, {
          code: SpanStatusCode.ERROR,
          message: 'Starting next model call before previous LLM span finished',
        });
      }

      const conversationId =
        ctx.conversationId ??
        (ctx as unknown as { threadId?: string }).threadId;

      const inputMessages = getInputMessages(config);
      const systemInstructions = getSystemInstructions(config);

      const parentContext = trace.setSpan(context.active(), state.chatSpan);

      const invocation = handler.startInference({
        parentContext,
        providerName: ctx.provider,
        requestModel: ctx.model,
        operationName: 'chat',
        conversationId,
        inputMessages,
        systemInstructions,
        requestOptions: {
          temperature: config.temperature,
          topP: config.topP,
          maxTokens: config.maxTokens,
          stream: ctx.streaming,
        },
        attributes: {
          'tanstack.ai.iteration': ctx.iteration,
          'tanstack.ai.source': ctx.source,
        },
      });

      state.currentLLM = {
        invocation,
        outputText: '',
        outputToolCalls: new Map(),
      };

      return {
        wrapFetch: (originalFetch: typeof fetch) => {
          return (input: RequestInfo | URL, init?: RequestInit) => {
            return invocation.withContext(() => originalFetch(input, init));
          };
        },
      } as Record<string, unknown>;
    },

    onIteration(ctx, info) {
      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }
      state.chatSpan.addEvent('tanstack.ai.iteration', {
        iteration: info.iteration,
        'tanstack.ai.message.id': info.messageId,
      });
    },

    onChunk(ctx, chunk) {
      const state = requestStates.get(ctx.requestId);
      if (!state?.currentLLM) {
        return;
      }

      const currentLLM = state.currentLLM;

      switch (chunk.type) {
        case 'TEXT_MESSAGE_CONTENT': {
          currentLLM.invocation.recordStreamChunk();
          currentLLM.outputText =
            chunk.content ?? `${currentLLM.outputText}${chunk.delta ?? ''}`;
          break;
        }
        case 'TOOL_CALL_START': {
          initializeToolCall(currentLLM, chunk);
          break;
        }
        case 'TOOL_CALL_ARGS': {
          updateToolCallArguments(currentLLM, chunk);
          break;
        }
        case 'TOOL_CALL_END': {
          completeToolCall(currentLLM, chunk);
          break;
        }
        case 'RUN_FINISHED': {
          const tanstackMeta = (
            chunk as unknown as {
              metadata?: { tanstack?: Record<string, unknown> };
            }
          ).metadata?.tanstack;

          const responseModel =
            (typeof tanstackMeta?.model === 'string'
              ? tanstackMeta.model
              : undefined) ?? chunk.model;
          if (responseModel) {
            currentLLM.invocation.setResponseModel(responseModel);
          }

          const responseId =
            (typeof tanstackMeta?.responseId === 'string'
              ? tanstackMeta.responseId
              : typeof tanstackMeta?.id === 'string'
                ? tanstackMeta.id
                : undefined) ??
            (chunk as unknown as { responseId?: string }).responseId ??
            chunk.runId;
          if (responseId) {
            currentLLM.invocation.setResponseId(responseId);
          }

          const finishReason =
            (typeof tanstackMeta?.finishReason === 'string'
              ? tanstackMeta.finishReason
              : undefined) ?? chunk.finishReason;

          const usage =
            (tanstackMeta?.usage as UsageInfo | undefined) ??
            chunk.usage ??
            undefined;

          endCurrentLLM(
            state,
            { code: SpanStatusCode.UNSET },
            usage,
            finishReason
          );
          break;
        }
        case 'RUN_ERROR': {
          endCurrentLLM(
            state,
            {
              code: SpanStatusCode.ERROR,
              message: chunk.error.message,
            },
            undefined,
            undefined,
            new Error(chunk.error.message)
          );
          break;
        }
      }
    },

    onBeforeToolCall(ctx, hookCtx) {
      if (isTracingSuppressed(context.active())) {
        return;
      }

      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }

      const parentContext = trace.setSpan(context.active(), state.chatSpan);
      const conversationId =
        ctx.conversationId ??
        (ctx as unknown as { threadId?: string }).threadId;
      const toolName =
        (hookCtx as unknown as { toolCallName?: string }).toolCallName ??
        hookCtx.toolName ??
        '';

      const toolInvocation = handler.startTool({
        parentContext,
        toolName,
        toolCallId: hookCtx.toolCallId,
        toolDescription: getToolDescription(hookCtx.tool),
        toolArguments: hookCtx.args,
        agentName,
        conversationId,
      });

      state.toolInvocations.set(hookCtx.toolCallId, toolInvocation);

      // Manage tool execution context per call rather than capturing in a wrapper
      // added to the shared tool object.
      // 1. Tool objects may be shared across multiple calls and concurrent chat requests.
      // 2. TanStack AI prepares parallel calls before starting tool bodies.
      // 3. Coordination across middleware instances and terminal cleanup on error/abort
      //    ensures wrappers are not prematurely stripped and pending queues are drained.
      const toolWithExecute = hookCtx.tool as
        | {
            execute?: (...args: unknown[]) => unknown;
          }
        | undefined;
      if (
        toolWithExecute &&
        typeof toolWithExecute.execute === 'function' &&
        typeof toolWithExecute === 'object' &&
        toolWithExecute !== null
      ) {
        state.toolsByCallId.set(hookCtx.toolCallId, toolWithExecute);

        let pending = globalPendingCallsByTool.get(toolWithExecute);
        if (!pending) {
          pending = [];
          globalPendingCallsByTool.set(toolWithExecute, pending);
        }
        pending.push({
          requestId: ctx.requestId,
          toolCallId: hookCtx.toolCallId,
          invocation: toolInvocation,
        });

        if (!globalOriginalExecutes.has(toolWithExecute)) {
          const originalExecute = toolWithExecute.execute;
          globalOriginalExecutes.set(toolWithExecute, originalExecute);

          toolWithExecute.execute = function (
            this: unknown,
            ...args: unknown[]
          ) {
            // TanStack AI passes context as the 2nd argument: { toolCallId, emitCustomEvent, ... }
            const execCtx = args[1] as { toolCallId?: string } | undefined;
            const callId = execCtx?.toolCallId;

            const pendingList = globalPendingCallsByTool.get(toolWithExecute);
            let matched: PendingToolExecution | undefined;

            if (pendingList && pendingList.length > 0) {
              if (callId) {
                const idx = pendingList.findIndex(p => p.toolCallId === callId);
                if (idx !== -1) {
                  matched = pendingList.splice(idx, 1)[0];
                }
              }
              if (!matched) {
                matched = pendingList.shift();
              }
            }

            const origFn =
              globalOriginalExecutes.get(toolWithExecute) ?? originalExecute;

            if (matched?.invocation) {
              return matched.invocation.withContext(() =>
                origFn.apply(this, args)
              );
            }
            return origFn.apply(this, args);
          };
        }
      }
    },

    onAfterToolCall(ctx, info) {
      const state = requestStates.get(ctx.requestId);
      const toolInvocation = state?.toolInvocations.get(info.toolCallId);
      if (!toolInvocation) {
        return;
      }

      if (info.ok) {
        toolInvocation.setResult(info.result);
        toolInvocation.stop();
      } else {
        const error =
          info.error instanceof Error
            ? info.error
            : new Error('Tool call failed');
        toolInvocation.fail({
          exception: error,
          statusDescription: error.message,
        });
      }

      state?.toolInvocations.delete(info.toolCallId);

      const tool =
        info.tool && typeof info.tool === 'object' && info.tool !== null
          ? (info.tool as object)
          : state?.toolsByCallId.get(info.toolCallId);

      state?.toolsByCallId.delete(info.toolCallId);

      // Clean up pending queue and restore execute function if no calls remain pending across all requests
      if (tool) {
        cleanupPendingForRequest(tool, ctx.requestId, info.toolCallId);
      }
    },

    onUsage() {},

    onFinish(ctx, info) {
      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }

      if (state.currentLLM) {
        endCurrentLLM(state, { code: SpanStatusCode.UNSET });
      }

      const finishReason =
        (
          info as unknown as {
            metadata?: { tanstack?: Record<string, unknown> };
          }
        ).metadata?.tanstack?.finishReason ??
        info.finishReason ??
        '';

      state.chatSpan.setAttributes({
        'tanstack.ai.finish_reason': finishReason,
        'tanstack.ai.duration_ms': info.duration,
      });

      state.toolInvocations.forEach(inv => {
        inv.stop();
      });
      state.toolInvocations.clear();

      state.toolsByCallId.forEach(tool => {
        cleanupPendingForRequest(tool, ctx.requestId);
      });
      state.toolsByCallId.clear();

      state.chatSpan.end();
      requestStates.delete(ctx.requestId);
    },

    onAbort(ctx, info) {
      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }

      const reason = info.reason ?? 'TanStack AI run aborted';
      if (state.currentLLM) {
        endCurrentLLM(state, {
          code: SpanStatusCode.ERROR,
          message: reason,
        });
      }

      state.chatSpan.setAttributes({
        'tanstack.ai.abort.reason': reason,
        'tanstack.ai.duration_ms': info.duration,
      });
      state.chatSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: reason,
      });

      endAllToolSpansWithError(state.toolInvocations, reason);

      state.toolsByCallId.forEach(tool => {
        cleanupPendingForRequest(tool, ctx.requestId);
      });
      state.toolsByCallId.clear();

      state.chatSpan.end();
      requestStates.delete(ctx.requestId);
    },

    onError(ctx, info) {
      const state = requestStates.get(ctx.requestId);
      if (!state) {
        return;
      }

      const error =
        info.error instanceof Error
          ? info.error
          : new Error('TanStack AI run failed');

      if (state.currentLLM) {
        endCurrentLLM(
          state,
          {
            code: SpanStatusCode.ERROR,
            message: error.message,
          },
          undefined,
          undefined,
          error
        );
      }

      state.chatSpan.recordException(error);
      state.chatSpan.setAttributes({
        'tanstack.ai.duration_ms': info.duration,
      });
      state.chatSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      endAllToolSpansWithError(state.toolInvocations, error.message);

      state.toolsByCallId.forEach(tool => {
        cleanupPendingForRequest(tool, ctx.requestId);
      });
      state.toolsByCallId.clear();

      state.chatSpan.end();
      requestStates.delete(ctx.requestId);
    },
  };
}

export const createOpenTelemetryMiddleware = openTelemetryMiddleware;
