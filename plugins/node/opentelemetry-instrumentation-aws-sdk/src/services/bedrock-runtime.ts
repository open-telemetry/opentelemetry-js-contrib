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
import { Attributes, DiagLogger, Span, Tracer } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
} from '../semconv';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
import type {
  ConverseStreamOutput,
  TokenUsage,
} from '@aws-sdk/client-bedrock-runtime';

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ): RequestMetadata {
    switch (request.commandName) {
      case 'Converse':
        return this.requestPreSpanHookConverse(request, config, diag, false);
      case 'ConverseStream':
        return this.requestPreSpanHookConverse(request, config, diag, true);
    }

    return {
      isIncoming: false,
    };
  }

  private requestPreSpanHookConverse(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
    isStream: boolean
  ): RequestMetadata {
    let spanName = GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const spanAttributes: Attributes = {
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
    };

    const modelId = request.commandInput.modelId;
    if (modelId) {
      spanAttributes[ATTR_GEN_AI_REQUEST_MODEL] = modelId;
      if (spanName) {
        spanName += ` ${modelId}`;
      }
    }

    const inferenceConfig = request.commandInput.inferenceConfig;
    if (inferenceConfig) {
      const { maxTokens, temperature, topP, stopSequences } = inferenceConfig;
      if (maxTokens !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = maxTokens;
      }
      if (temperature !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = temperature;
      }
      if (topP !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = topP;
      }
      if (stopSequences !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = stopSequences;
      }
    }

    return {
      spanName,
      isIncoming: false,
      isStream,
      spanAttributes,
    };
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    if (!span.isRecording()) {
      return;
    }

    switch (response.request.commandName) {
      case 'Converse':
        return this.responseHookConverse(response, span, tracer, config);
      case 'ConverseStream':
        return this.responseHookConverseStream(response, span, tracer, config);
    }
  }

  private responseHookConverse(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const { stopReason, usage } = response.data;

    BedrockRuntimeServiceExtension.setStopReason(span, stopReason);
    BedrockRuntimeServiceExtension.setUsage(span, usage);
  }

  private responseHookConverseStream(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    return {
      ...response.data,
      stream: this.wrapConverseStreamResponse(response.data.stream, span),
    };
  }

  private async *wrapConverseStreamResponse(
    response: AsyncIterable<ConverseStreamOutput>,
    span: Span
  ) {
    try {
      for await (const item of response) {
        BedrockRuntimeServiceExtension.setStopReason(
          span,
          item.messageStop?.stopReason
        );
        BedrockRuntimeServiceExtension.setUsage(span, item.metadata?.usage);
        yield item;
      }
    } finally {
      span.end();
    }
  }

  private static setStopReason(span: Span, stopReason: string | undefined) {
    if (stopReason !== undefined) {
      console.log(stopReason);
      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
    }
  }

  private static setUsage(span: Span, usage: TokenUsage | undefined) {
    if (usage) {
      const { inputTokens, outputTokens } = usage;
      if (inputTokens !== undefined) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
      }
      if (outputTokens !== undefined) {
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
      }
    }
  }
}
