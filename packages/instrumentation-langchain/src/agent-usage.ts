/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BaseCallbackHandler,
  CallbackHandlerMethods,
} from '@langchain/core/callbacks/base';
import type {
  CallbackManager,
  Callbacks,
} from '@langchain/core/callbacks/manager';
import type { DiagLogger, Span } from '@opentelemetry/api';
import { isRecord } from './content';
import {
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from './semconv';

/**
 * Observe model callbacks only to summarize this agent invocation. Output
 * histories may contain checkpointed messages, so summing them would overcount.
 * The manager factory must come from the instrumented SDK's module hook.
 */
export function createAgentUsageHandler(
  span: Span,
  diag: DiagLogger,
  callbackManager: Pick<typeof CallbackManager, 'fromHandlers'>
): BaseCallbackHandler {
  const runs = new Set<string>();
  const reasons: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const methods: CallbackHandlerMethods & {
    name: string;
    awaitHandlers: true;
  } = {
    name: `opentelemetry-langchain-agent-usage-${span.spanContext().spanId}`,
    // Keep this synchronous observer out of the SDK's serial background queue,
    // including when the SDK copies the handler created from these methods.
    awaitHandlers: true,
    handleLLMEnd(output, runId) {
      if (runs.has(runId) || !span.isRecording()) return;
      runs.add(runId);
      try {
        const generation = output.generations[0]?.[0];
        const message =
          generation && 'message' in generation
            ? generation.message
            : undefined;
        const messageUsage =
          isRecord(message) && isRecord(message.usage_metadata)
            ? message.usage_metadata
            : undefined;
        const llmOutput = output.llmOutput;
        const usage =
          messageUsage ??
          (isRecord(llmOutput?.tokenUsage)
            ? llmOutput?.tokenUsage
            : undefined) ??
          (isRecord(llmOutput?.usage) ? llmOutput?.usage : undefined) ??
          (isRecord(llmOutput?.estimatedTokenUsage)
            ? llmOutput?.estimatedTokenUsage
            : undefined);
        const input = usage?.input_tokens ?? usage?.promptTokens;
        const completion = usage?.output_tokens ?? usage?.completionTokens;
        if (
          typeof input === 'number' &&
          Number.isInteger(input) &&
          input >= 0
        ) {
          inputTokens += input;
          span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
        }
        if (
          typeof completion === 'number' &&
          Number.isInteger(completion) &&
          completion >= 0
        ) {
          outputTokens += completion;
          span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
        }
        for (const batch of output.generations) {
          for (const item of batch) {
            const info = item.generationInfo;
            const msg =
              'message' in item && isRecord(item.message)
                ? item.message
                : undefined;
            const metadata = isRecord(msg?.response_metadata)
              ? msg?.response_metadata
              : undefined;
            const reason =
              info?.finish_reason ??
              metadata?.finish_reason ??
              metadata?.stop_reason;
            if (typeof reason === 'string') reasons.push(reason);
          }
        }
        if (reasons.length)
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [...reasons]);
      } catch {
        diag.warn('LangChain: could not summarize agent model usage');
      }
    },
  };
  return callbackManager.fromHandlers(methods).handlers[0];
}

export function agentUsageCallbacks(
  callbacks: Callbacks | undefined,
  span: Span,
  diag: DiagLogger,
  callbackManager: Pick<typeof CallbackManager, 'fromHandlers'>
): Callbacks {
  const observer = createAgentUsageHandler(span, diag, callbackManager);
  if (!callbacks || Array.isArray(callbacks))
    return [...(callbacks ?? []), observer];
  const copy = callbacks.copy();
  copy.addHandler(observer, true);
  return copy;
}
