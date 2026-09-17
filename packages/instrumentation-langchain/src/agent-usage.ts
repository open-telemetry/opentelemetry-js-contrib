/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base';
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
 */
export function agentUsageCallbacks(
  callbacks: Callbacks | undefined,
  span: Span,
  diag: DiagLogger
): Callbacks {
  const runs = new Set<string>();
  const reasons = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  const observer: CallbackHandlerMethods = {
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
          (isRecord(llmOutput?.usage) ? llmOutput?.usage : undefined);
        const input = usage?.input_tokens ?? usage?.promptTokens;
        const completion = usage?.output_tokens ?? usage?.completionTokens;
        if (typeof input === 'number' && Number.isFinite(input) && input >= 0) {
          inputTokens += input;
          span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
        }
        if (
          typeof completion === 'number' &&
          Number.isFinite(completion) &&
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
            if (typeof reason === 'string') reasons.add(reason);
          }
        }
        if (reasons.size)
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [...reasons]);
      } catch {
        diag.warn('LangChain: could not summarize agent model usage');
      }
    },
  };
  if (!callbacks || Array.isArray(callbacks))
    return [...(callbacks ?? []), observer];
  const copy = callbacks.copy();
  const managerClass = callbacks.constructor as typeof CallbackManager;
  copy.addHandler(managerClass.fromHandlers(observer).handlers[0], true);
  return copy;
}
