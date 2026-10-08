/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HrTime, SpanKind, type Attributes } from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
} from '../semconv';
import type { EmbeddingInvocationOptions, TokenUsageDetails } from '../types';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';
import { mergeTokenUsageDetails, inferMissingTokenCounts } from '../utils';

/**
 * Format a GenAI span name for an embedding invocation adhering to
 * OpenTelemetry semantic conventions.
 *
 * Format: `{gen_ai.operation.name} {gen_ai.request.model}` when model is present,
 * or `{gen_ai.operation.name}` when model is omitted.
 *
 * @param options - Embedding invocation options.
 * @returns Standardized span name string.
 */
function getEmbeddingSpanName(options: EmbeddingInvocationOptions): string {
  const operationName =
    options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS;
  const model = options.requestModel?.trim();
  return model ? `${operationName} ${model}` : operationName;
}

/**
 * Build the span attributes that are known when the embedding span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 */
function buildInitialAttributes(
  options: EmbeddingInvocationOptions
): Attributes {
  const attrs: Attributes = {
    ...options.attributes,
    [ATTR_GEN_AI_PROVIDER_NAME]: options.providerName,
    [ATTR_GEN_AI_OPERATION_NAME]:
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  };

  if (options.requestModel) {
    attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
  }
  if (options.encodingFormats && options.encodingFormats.length > 0) {
    attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = options.encodingFormats;
  }
  if (options.dimensionCount !== undefined) {
    attrs[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT] = options.dimensionCount;
  }
  if (options.serverAddress) {
    attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
    if (options.serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = options.serverPort;
    }
  }

  return attrs;
}

/**
 * Manages the lifecycle and telemetry of an Embedding operation.
 *
 * @experimental This class is experimental and subject to change.
 */
export class EmbeddingInvocation extends BaseInvocation {
  private readonly _providerName: string;
  private readonly _operationName: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private _usage?: TokenUsageDetails;
  private _responseModel?: string;

  /**
   * Start an embedding invocation, creating and starting the underlying span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Request details, parent context, and initial attributes.
   */
  constructor(handler: TelemetryHandler, options: EmbeddingInvocationOptions) {
    super(getEmbeddingSpanName(options), handler, {
      kind: SpanKind.CLIENT,
      attributes: buildInitialAttributes(options),
      metricAttributes: options.metricAttributes,
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._providerName = options.providerName;
    this._operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
  }

  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  public setDimensionCount(count: number): this {
    this._span.setAttribute(ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT, count);
    return this;
  }

  public setEncodingFormats(formats: string[]): this {
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_ENCODING_FORMATS, formats);
    return this;
  }

  /**
   * Semantic convention dimensions shared by all metrics recorded for this invocation.
   *
   * Caller-supplied metric attributes override these; see
   * {@link BaseInvocation._getMetricAttributes}.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
      if (this._serverPort !== undefined) {
        metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
      }
    }
    return metricAttrs;
  }

  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    if (this._usage) {
      this._usage = inferMissingTokenCounts(this._usage);
      if (
        this._usage.inputTokenCount !== undefined &&
        this._usage.inputTokenCount >= 0
      ) {
        this._span.setAttribute(
          ATTR_GEN_AI_USAGE_INPUT_TOKENS,
          this._usage.inputTokenCount
        );
      }
    }
  }

  /**
   * Record token usage.
   *
   * May be called multiple times (e.g. when a streaming provider reports input
   * and output tokens in separate events). Only fields that are defined in
   * `usage` are updated; previously recorded values for other fields are kept.
   * The span attributes are derived from the merged usage once, when the invocation ends.
   *
   * Only input usage tokens are supported for Embedding Invocations.
   *
   * Note (applied to the merged usage when the invocation ends):
   * If `usage` TokenUsage does not contain inputTokens, it is inferred using the cache read tokens and cache write tokens.
   */
  public setUsage(usage: TokenUsageDetails): this {
    this._usage = mergeTokenUsageDetails(this._usage, usage);
    return this;
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    const metricAttrs = this._getMetricAttributes(errorType);

    // The invocation context is passed explicitly: metrics are recorded while the
    // invocation's context may no longer be active, and exemplars must still point
    // at the invocation span.
    this._handler.recordOperationDuration(
      durationSec,
      metricAttrs,
      this._context
    );
  }
}
