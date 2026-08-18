/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, HrTime, Span } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
} from '../semconv';
import type { RetrievalInvocationOptions } from '../types';
import { getErrorType, serializeContent } from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Retrieval operation (vector database / RAG retrievers).
 */
export class RetrievalInvocation extends BaseInvocation {
  private readonly _dataSourceId?: string;
  private readonly _providerName?: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private _topK?: number;

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: RetrievalInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    super(span, handler, startTime);
    this._dataSourceId = options.dataSourceId;
    this._providerName = options.providerName;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
    this._topK = options.topK;

    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
      ...options.attributes,
    };

    if (this._dataSourceId) {
      attrs[ATTR_GEN_AI_DATA_SOURCE_ID] = this._dataSourceId;
    }
    if (this._providerName) {
      attrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    if (this._topK !== undefined) {
      attrs[ATTR_GEN_AI_REQUEST_TOP_K] = this._topK;
    }

    this._span.setAttributes(attrs);

    if (options.queryText) {
      this.setQueryText(options.queryText);
    }
    if (options.documents) {
      this.setDocuments(options.documents);
    }
  }

  public setQueryText(queryText: string): this {
    if (
      this._handler &&
      isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())
    ) {
      this._span.setAttribute(ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT, queryText);
    }
    return this;
  }

  public setDocuments(documents: unknown[]): this {
    if (
      this._handler &&
      isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())
    ) {
      const formatted = serializeContent(documents);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_RETRIEVAL_DOCUMENTS, formatted);
      }
    }
    return this;
  }

  public setTopK(topK: number): this {
    this._topK = topK;
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_TOP_K, topK);
    return this;
  }

  protected override _recordMetrics(
    durationSec: number,
    error?: unknown
  ): void {
    if (!this._handler) {
      return;
    }
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
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

    this._handler.recordOperationDuration(durationSec, metricAttrs);
  }
}
