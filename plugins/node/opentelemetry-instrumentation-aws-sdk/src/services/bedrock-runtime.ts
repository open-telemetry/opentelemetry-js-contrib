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
  GEN_AI_TOKEN_TYPE_VALUE_COMPLETION,
} from '../semconv';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private tokenUsage!: Histogram;
  private operationDuration!: Histogram;

  updateMetricInstruments(meter: Meter) {
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
        return this.requestPreSpanHookConverse(request, config, diag);
    }

    return {
      isIncoming: false,
    };
  }

  private requestPreSpanHookConverse(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
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
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_COMPLETION,
        });
      }
    }

    if (stopReason !== undefined) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
    }
  }
}
