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
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';

// Unstable attributes to define inline.
const SEMATTRS_GEN_AI_SYSTEM = 'gen_ai.system';
const SEMATTRS_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
const SEMATTRS_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
const SEMATTRS_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
const SEMATTRS_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
const SEMATTRS_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
const SEMATTRS_GEN_AI_REQUEST_STOP_SEQUENCES = 'gen_ai.request.stop_sequences';
const SEMATTRS_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const SEMATTRS_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const SEMATTRS_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons';

export class BedrockRuntimeExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ): RequestMetadata {
    let spanName: string | undefined;
    const spanAttributes: Attributes = {
      [SEMATTRS_GEN_AI_SYSTEM]: 'bedrock',
    };

    switch (request.commandName) {
      case 'Converse':
        spanAttributes[SEMATTRS_GEN_AI_OPERATION_NAME] = 'chat';
        spanName = 'chat';
        break;
    }

    const modelId = request.commandInput.modelId;
    if (modelId) {
      spanAttributes[SEMATTRS_GEN_AI_REQUEST_MODEL] = modelId;
      if (spanName) {
        spanName += ` ${modelId}`;
      }
    }

    const inferenceConfig = request.commandInput.inferenceConfig;
    if (inferenceConfig) {
      const { maxTokens, temperature, topP, stopSequences } = inferenceConfig;
      if (maxTokens !== undefined) {
        spanAttributes[SEMATTRS_GEN_AI_REQUEST_MAX_TOKENS] = maxTokens;
      }
      if (temperature !== undefined) {
        spanAttributes[SEMATTRS_GEN_AI_REQUEST_TEMPERATURE] = temperature;
      }
      if (topP !== undefined) {
        spanAttributes[SEMATTRS_GEN_AI_REQUEST_TOP_P] = topP;
      }
      if (stopSequences !== undefined) {
        spanAttributes[SEMATTRS_GEN_AI_REQUEST_STOP_SEQUENCES] = stopSequences;
      }
    }

    return {
      spanName,
      isIncoming: false,
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

    const { stopReason, usage } = response.data;
    const { inputTokens, outputTokens } = usage;
    if (inputTokens !== undefined) {
      span.setAttribute(SEMATTRS_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
    }
    if (outputTokens !== undefined) {
      span.setAttribute(SEMATTRS_GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
    }

    if (stopReason !== undefined) {
      span.setAttribute(SEMATTRS_GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
    }
  }
}
