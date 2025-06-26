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
import {
  Attributes,
  DiagLogger,
  Histogram,
  HrTime,
  Meter,
  Span,
  Tracer,
  ValueType,
} from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_TOKEN_TYPE,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
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
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private tokenUsage!: Histogram;
  private operationDuration!: Histogram;

  updateMetricInstruments(meter: Meter) {
    // https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/#metric-gen_aiclienttokenusage
    this.tokenUsage = meter.createHistogram('gen_ai.client.token.usage', {
      unit: '{token}',
      description: 'Measures number of input and output tokens used',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: [
          1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
          16777216, 67108864,
        ],
      },
    });

    // https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/#metric-gen_aiclientoperationduration
    this.operationDuration = meter.createHistogram(
      'gen_ai.client.operation.duration',
      {
        unit: 's',
        description: 'GenAI operation duration',
        advice: {
          explicitBucketBoundaries: [
            0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
            20.48, 40.96, 81.92,
          ],
        },
      }
    );
  }

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
      case 'InvokeModel':
        return this.requestPreSpanHookInvokeModel(request, config, diag);
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

  private requestPreSpanHookInvokeModel(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ): RequestMetadata {
    let spanName: string | undefined;
    const spanAttributes: Attributes = {
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      // add operation name for InvokeModel API
    };

    const modelId = request.commandInput?.modelId;
    if (modelId) {
      spanAttributes[ATTR_GEN_AI_REQUEST_MODEL] = modelId;
    }

    if (request.commandInput?.body) {
      const requestBody = JSON.parse(request.commandInput.body);
      if (modelId.includes('amazon.titan')) {
        if (requestBody.textGenerationConfig?.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.textGenerationConfig.temperature;
        }
        if (requestBody.textGenerationConfig?.topP !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] =
            requestBody.textGenerationConfig.topP;
        }
        if (requestBody.textGenerationConfig?.maxTokenCount !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.textGenerationConfig.maxTokenCount;
        }
        if (requestBody.textGenerationConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
            requestBody.textGenerationConfig.stopSequences;
        }
      } else if (modelId.includes('amazon.nova')) {
        if (requestBody.inferenceConfig?.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.inferenceConfig.temperature;
        }
        if (requestBody.inferenceConfig?.top_p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] =
            requestBody.inferenceConfig.top_p;
        }
        if (requestBody.inferenceConfig?.max_new_tokens !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.inferenceConfig.max_new_tokens;
        }
        if (requestBody.inferenceConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
            requestBody.inferenceConfig.stopSequences;
        }
      } else if (modelId.includes('anthropic.claude')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
            requestBody.stop_sequences;
        }
      } else if (modelId.includes('meta.llama')) {
        if (requestBody.max_gen_len !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.max_gen_len;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        // request for meta llama models does not contain stop_sequences field
      } else if (modelId.includes('cohere.command-r')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.message !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(
            requestBody.message.length / 6
          );
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
            requestBody.stop_sequences;
        }
      } else if (modelId.includes('cohere.command')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.prompt !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(
            requestBody.prompt.length / 6
          );
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
            requestBody.stop_sequences;
        }
      } else if (modelId.includes('mistral')) {
        if (requestBody.prompt !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(
            requestBody.prompt.length / 6
          );
        }
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
            requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] =
            requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop;
        }
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
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) {
    if (!span.isRecording()) {
      return;
    }

    switch (response.request.commandName) {
      case 'Converse':
        return this.responseHookConverse(
          response,
          span,
          tracer,
          config,
          startTime
        );
      case 'ConverseStream':
        return this.responseHookConverseStream(
          response,
          span,
          tracer,
          config,
          startTime
        );
      case 'InvokeModel':
        return this.responseHookInvokeModel(response, span, tracer, config);
    }
  }

  private responseHookConverse(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) {
    const { stopReason, usage } = response.data;

    BedrockRuntimeServiceExtension.setStopReason(span, stopReason);
    this.setUsage(response, span, usage, startTime);
  }

  private responseHookConverseStream(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) {
    return {
      ...response.data,
      // Wrap and replace the response stream to allow processing events to telemetry
      // before yielding to the user.
      stream: this.wrapConverseStreamResponse(
        response,
        response.data.stream,
        span,
        startTime
      ),
    };
  }

  private async *wrapConverseStreamResponse(
    response: NormalizedResponse,
    stream: AsyncIterable<ConverseStreamOutput>,
    span: Span,
    startTime: HrTime
  ) {
    try {
      let usage: TokenUsage | undefined;
      for await (const item of stream) {
        BedrockRuntimeServiceExtension.setStopReason(
          span,
          item.messageStop?.stopReason
        );
        usage = item.metadata?.usage;
        yield item;
      }
      this.setUsage(response, span, usage, startTime);
    } finally {
      span.end();
    }
  }

  private static setStopReason(span: Span, stopReason: string | undefined) {
    if (stopReason !== undefined) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
    }
  }

  private setUsage(
    response: NormalizedResponse,
    span: Span,
    usage: TokenUsage | undefined,
    startTime: HrTime
  ) {
    const sharedMetricAttrs: Attributes = {
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      [ATTR_GEN_AI_REQUEST_MODEL]: response.request.commandInput.modelId,
    };

    const durationSecs =
      hrTimeToMilliseconds(hrTimeDuration(startTime, hrTime())) / 1000;
    this.operationDuration.record(durationSecs, sharedMetricAttrs);

    if (usage) {
      const { inputTokens, outputTokens } = usage;
      if (inputTokens !== undefined) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);

        this.tokenUsage.record(inputTokens, {
          ...sharedMetricAttrs,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
        });
      }
      if (outputTokens !== undefined) {
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);

        this.tokenUsage.record(outputTokens, {
          ...sharedMetricAttrs,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
        });
      }
    }
  }

  private responseHookInvokeModel(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const currentModelId = response.request.commandInput?.modelId;
    if (response.data?.body) {
      const decodedResponseBody = new TextDecoder().decode(response.data.body);
      const responseBody = JSON.parse(decodedResponseBody);
      if (currentModelId.includes('amazon.titan')) {
        if (responseBody.inputTextTokenCount !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            responseBody.inputTextTokenCount
          );
        }
        if (responseBody.results?.[0]?.tokenCount !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            responseBody.results[0].tokenCount
          );
        }
        if (responseBody.results?.[0]?.completionReason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.results[0].completionReason,
          ]);
        }
      } else if (currentModelId.includes('amazon.nova')) {
        if (responseBody.usage !== undefined) {
          if (responseBody.usage.inputTokens !== undefined) {
            span.setAttribute(
              ATTR_GEN_AI_USAGE_INPUT_TOKENS,
              responseBody.usage.inputTokens
            );
          }
          if (responseBody.usage.outputTokens !== undefined) {
            span.setAttribute(
              ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
              responseBody.usage.outputTokens
            );
          }
        }
        if (responseBody.stopReason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.stopReason,
          ]);
        }
      } else if (currentModelId.includes('anthropic.claude')) {
        if (responseBody.usage?.input_tokens !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            responseBody.usage.input_tokens
          );
        }
        if (responseBody.usage?.output_tokens !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            responseBody.usage.output_tokens
          );
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.stop_reason,
          ]);
        }
      } else if (currentModelId.includes('meta.llama')) {
        if (responseBody.prompt_token_count !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            responseBody.prompt_token_count
          );
        }
        if (responseBody.generation_token_count !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            responseBody.generation_token_count
          );
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.stop_reason,
          ]);
        }
      } else if (currentModelId.includes('cohere.command-r')) {
        if (responseBody.text !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            Math.ceil(responseBody.text.length / 6)
          );
        }
        if (responseBody.finish_reason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.finish_reason,
          ]);
        }
      } else if (currentModelId.includes('cohere.command')) {
        if (responseBody.generations?.[0]?.text !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            // NOTE: We approximate the token count since this value is not directly available in the body
            // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
            // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
            Math.ceil(responseBody.generations[0].text.length / 6)
          );
        }
        if (responseBody.generations?.[0]?.finish_reason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.generations[0].finish_reason,
          ]);
        }
      } else if (currentModelId.includes('mistral')) {
        if (responseBody.outputs?.[0]?.text !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            // NOTE: We approximate the token count since this value is not directly available in the body
            // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
            // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
            Math.ceil(responseBody.outputs[0].text.length / 6)
          );
        }
        if (responseBody.outputs?.[0]?.stop_reason !== undefined) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            responseBody.outputs[0].stop_reason,
          ]);
        }
      }
    }
  }
}
