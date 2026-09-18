/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
} from '../semconv';
import type { EmbeddingInvocationOptions, TokenUsage } from '../types';
import { getErrorType, getSpanName } from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Build the span attributes that are known when the embedding span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 */
function buildInitialAttributes(
  options: EmbeddingInvocationOptions
): Attributes {
  const attrs: Attributes = {
    [ATTR_GEN_AI_PROVIDER_NAME]: options.providerName,
    [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
    ...options.attributes,
  };

  if (options.requestModel) {
    attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
  }
  if (options.serverAddress) {
    attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
  }
  if (options.serverPort !== undefined) {
    attrs[ATTR_SERVER_PORT] = options.serverPort;
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
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private _responseModel?: string;
  private _usage?: TokenUsage;

  /**
   * Start an embedding invocation, creating and starting the underlying span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Request details, parent context, and initial attributes.
   */
  constructor(handler: TelemetryHandler, options: EmbeddingInvocationOptions) {
    super(
      getSpanName(GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS, options.requestModel),
      handler,
      {
        kind: SpanKind.CLIENT,
        attributes: buildInitialAttributes(options),
        context: options.parentContext,
        startTime: options.startTime,
      }
    );

    this._providerName = options.providerName;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
  }

  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  public getResponseModel(): string | undefined {
    return this._responseModel;
  }

  public setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    return this;
  }

  protected override _recordMetrics(
    durationSec: number,
    error?: unknown
  ): void {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
    };
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
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

    // The invocation context is passed explicitly: metrics are recorded while the
    // invocation's context may no longer be active, and exemplars must still point
    // at the invocation span.
    this._handler.recordOperationDuration(
      durationSec,
      metricAttrs,
      this._context
    );
    if (this._usage && !error) {
      this._handler.recordTokenUsage(this._usage, metricAttrs, this._context);
    }
  }
}
