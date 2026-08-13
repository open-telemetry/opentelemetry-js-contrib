/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error -- TypeScript 5.0 misclassifies erased imports from ESM-only packages as runtime requires.
import type * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  type Context,
  type DiagLogger,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

import {
  getAgentRequestInfo,
  getResultAttributes,
  getResultErrorMessage,
  getSystemMessageAttributes,
  isAssistantErrorMessage,
  isResultErrorMessage,
  isResultMessage,
  isSystemInitMessage,
} from './message-processor';
import { mergeToolHooks, ToolSpanTracker } from './tool-hooks';
import type { ClaudeAgentSDKInstrumentationConfig } from './types';

export type QueryFunction = typeof ClaudeAgentSDK.query;

interface QuerySpanState {
  span: Span;
  spanContext: Context;
  toolTracker: ToolSpanTracker;
  captureMessageContent: boolean;
  configuredModel: string | undefined;
  pendingErrorType: string | undefined;
  pendingErrorMessage: string | undefined;
  endOnResult: boolean;
  ended: boolean;
}

export function wrapQuery({
  original,
  getTracer,
  getConfig,
  isEnabled,
  diag,
}: {
  original: QueryFunction;
  getTracer: () => Tracer;
  getConfig: () => ClaudeAgentSDKInstrumentationConfig;
  isEnabled: () => boolean;
  diag: DiagLogger;
}): QueryFunction {
  return function wrappedQuery(params): ClaudeAgentSDK.Query {
    const activeContext = context.active();
    if (!isEnabled() || isTracingSuppressed(activeContext)) {
      return original(params);
    }

    const config = getConfig();
    const captureMessageContent = !!config.captureMessageContent;
    const requestInfo = getAgentRequestInfo({
      prompt: params.prompt,
      options: params.options,
      captureMessageContent,
    });

    let span: Span;
    let spanContext: Context;
    let toolTracker: ToolSpanTracker;
    let modifiedOptions: ClaudeAgentSDK.Options;
    try {
      span = getTracer().startSpan(
        `invoke_agent ${requestInfo.agentName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: requestInfo.initialAttributes,
        },
        activeContext
      );
      spanContext = trace.setSpan(activeContext, span);
      toolTracker = new ToolSpanTracker(
        getTracer(),
        spanContext,
        requestInfo.agentName,
        captureMessageContent
      );
      modifiedOptions = mergeToolHooks({
        options: params.options,
        toolTracker,
        diag,
      });
    } catch (error) {
      diag.error('error preparing Claude Agent SDK instrumentation', error);
      return original(params);
    }

    const state: QuerySpanState = {
      span,
      spanContext,
      toolTracker,
      captureMessageContent,
      configuredModel: requestInfo.configuredModel,
      pendingErrorType: undefined,
      pendingErrorMessage: undefined,
      endOnResult: typeof params.prompt === 'string',
      ended: false,
    };

    let query: ClaudeAgentSDK.Query;
    try {
      query = context.with(spanContext, () =>
        original({ ...params, options: modifiedOptions })
      );
    } catch (error) {
      endWithException(state, error);
      throw error;
    }

    return createQueryProxy(query, state);
  };
}

function createQueryProxy(
  query: ClaudeAgentSDK.Query,
  state: QuerySpanState
): ClaudeAgentSDK.Query {
  return new Proxy(query, {
    get(target, property, receiver) {
      if (property === Symbol.asyncIterator) {
        return () => receiver;
      }
      if (property === 'next') {
        return async (...args: Parameters<ClaudeAgentSDK.Query['next']>) => {
          try {
            const result = await context.with(state.spanContext, () =>
              target.next(...args)
            );
            if (!result.done) {
              processMessage(result.value, state);
            } else {
              endFromCurrentState(state);
            }
            return result;
          } catch (error) {
            endWithException(state, error);
            throw error;
          }
        };
      }
      if (property === 'return') {
        return async (...args: Parameters<ClaudeAgentSDK.Query['return']>) => {
          try {
            const result = await context.with(state.spanContext, () =>
              target.return(...args)
            );
            endFromCurrentState(state);
            return result;
          } catch (error) {
            endWithException(state, error);
            throw error;
          }
        };
      }
      if (property === 'throw') {
        return async (...args: Parameters<ClaudeAgentSDK.Query['throw']>) => {
          try {
            const result = await context.with(state.spanContext, () =>
              target.throw(...args)
            );
            if (!result.done) {
              processMessage(result.value, state);
            } else {
              endFromCurrentState(state);
            }
            return result;
          } catch (error) {
            endWithException(state, error);
            throw error;
          }
        };
      }
      if (property === 'close') {
        const close = Reflect.get(target, 'close') as unknown;
        if (typeof close !== 'function') {
          return close;
        }
        return () => {
          try {
            const result = Reflect.apply(close, target, []);
            endFromCurrentState(state);
            return result;
          } catch (error) {
            endWithException(state, error);
            throw error;
          }
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function processMessage(
  message: ClaudeAgentSDK.SDKMessage,
  state: QuerySpanState
): void {
  if (isSystemInitMessage(message)) {
    state.span.setAttributes(
      getSystemMessageAttributes({
        message,
        configuredModel: state.configuredModel,
      })
    );
    return;
  }

  if (isAssistantErrorMessage(message)) {
    state.pendingErrorType = message.error;
    state.pendingErrorMessage = message.error;
    return;
  }

  if (!isResultMessage(message)) {
    return;
  }

  state.span.setAttributes(
    getResultAttributes({
      message,
      captureMessageContent: state.captureMessageContent,
    })
  );

  if (isResultErrorMessage(message)) {
    state.pendingErrorType = message.subtype;
    state.pendingErrorMessage = getResultErrorMessage(message);
    if (state.endOnResult) {
      endWithResultError(
        state,
        state.pendingErrorType,
        state.pendingErrorMessage
      );
    }
  } else {
    state.pendingErrorType = undefined;
    state.pendingErrorMessage = undefined;
    if (state.endOnResult) {
      endSuccess(state);
    }
  }
}

function endFromCurrentState(state: QuerySpanState): void {
  if (state.pendingErrorType) {
    endWithResultError(
      state,
      state.pendingErrorType,
      state.pendingErrorMessage ?? state.pendingErrorType
    );
  } else {
    endSuccess(state);
  }
}

function endSuccess(state: QuerySpanState): void {
  if (!beginEnd(state)) {
    return;
  }
  state.span.end();
}

function endWithResultError(
  state: QuerySpanState,
  errorType: string,
  message: string
): void {
  if (!beginEnd(state)) {
    return;
  }
  state.span.setAttribute(ATTR_ERROR_TYPE, errorType);
  state.span.setStatus({ code: SpanStatusCode.ERROR, message });
  state.span.end();
}

function endWithException(state: QuerySpanState, error: unknown): void {
  if (!beginEnd(state)) {
    return;
  }
  const exception = error instanceof Error ? error : new Error(String(error));
  state.span.recordException(exception);
  state.span.setAttribute(ATTR_ERROR_TYPE, exception.name);
  state.span.setStatus({
    code: SpanStatusCode.ERROR,
    message: exception.message,
  });
  state.span.end();
}

function beginEnd(state: QuerySpanState): boolean {
  if (state.ended) {
    return false;
  }
  state.ended = true;
  state.toolTracker.endAllInFlight();
  return true;
}
