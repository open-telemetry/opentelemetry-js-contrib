/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  trace,
  SpanKind,
  SpanStatusCode,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  ATTR_GEN_AI_RETRIEVAL_TOP_K,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
} from './semconv';
import type {
  GenericFunction,
  LlamaIndexInstrumentationConfig,
  ObjectWithModel,
  SafeFunction,
} from './types';

/**
 * Wraps a function in a try/catch to safely return null on failure.
 */
export function withSafety<T extends GenericFunction>(fn: T): SafeFunction<T> {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      diag.error(`Failed to execute safe function: ${error}`);
      return null;
    }
  };
}

export const safelyJSONStringify = withSafety(JSON.stringify);

/**
 * Checks whether content capture is enabled via configuration or environment variable.
 * Opt-in for privacy; defaults to false.
 */
export function isContentCaptureEnabled(
  config?: LlamaIndexInstrumentationConfig
): boolean {
  const envVal =
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT?.trim().toLowerCase();
  if (envVal === 'true' || envVal === 'span_only' || envVal === 'span') {
    return true;
  }
  if (envVal === 'false' || envVal === 'none') {
    return false;
  }
  return config?.captureContent === true;
}

/**
 * Resolves the execution context for the current span.
 */
function getExecContext(span: Span): Context {
  const activeContext = context.active();
  const suppressTracing = isTracingSuppressed(activeContext);
  const execContext = suppressTracing
    ? trace.setSpan(context.active(), span)
    : activeContext;
  if (suppressTracing) {
    trace.deleteSpan(activeContext);
  }
  return execContext;
}

/**
 * Records error status and exception attributes on the span.
 */
function handleError(span: Span, error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordException(err);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err.message,
  });
  span.setAttribute(ATTR_ERROR_TYPE, err.name || 'Error');
  span.end();
}

/**
 * Checks whether the prototype implements retriever methods.
 */
export function isRetrieverPrototype(proto: unknown): boolean {
  return (
    proto != null &&
    typeof proto === 'object' &&
    'retrieve' in proto &&
    typeof (proto as Record<string, unknown>).retrieve === 'function'
  );
}

/**
 * Checks whether the prototype implements embedding methods.
 */
export function isEmbeddingPrototype(proto: unknown): boolean {
  return (
    proto != null &&
    typeof proto === 'object' &&
    'getQueryEmbedding' in proto &&
    typeof (proto as Record<string, unknown>).getQueryEmbedding === 'function'
  );
}

/**
 * Retrieves the model name from an object if available.
 */
function getModelName(cls: unknown): string | undefined {
  if (cls != null && typeof cls === 'object' && 'model' in cls) {
    const model = (cls as ObjectWithModel).model;
    if (typeof model === 'string') {
      return model;
    }
  }
  return undefined;
}

/**
 * Extracts and formats documents returned from retrieval.
 */
function formatRetrievedDocuments(
  output: unknown,
  captureContent: boolean
): string | undefined {
  if (!Array.isArray(output)) {
    return undefined;
  }

  const docs = output.map(item => {
    const node = item?.node ?? item;
    const score = item?.score;
    const id = node?.id_ ?? node?.id;
    const content = captureContent
      ? typeof node?.getContent === 'function'
        ? node.getContent()
        : node?.text ?? node?.content
      : undefined;
    const metadata = node?.metadata;

    return {
      id,
      score,
      content,
      metadata,
    };
  });

  return safelyJSONStringify(docs) ?? undefined;
}

/**
 * Patches RetrieverQueryEngine.prototype.query
 */
export function patchQueryEngineQueryMethod(
  original: GenericFunction,
  tracer: Tracer,
  config?: LlamaIndexInstrumentationConfig
) {
  return function (this: unknown, ...args: unknown[]) {
    const captureContent = isContentCaptureEnabled(config);
    const queryArg = args[0] as { query?: string } | string | undefined;
    const queryText =
      typeof queryArg === 'string'
        ? queryArg
        : queryArg && typeof queryArg === 'object' && 'query' in queryArg
          ? queryArg.query
          : safelyJSONStringify(queryArg);

    const span = tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW} RetrieverQueryEngine`,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]:
            GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
          [ATTR_GEN_AI_WORKFLOW_NAME]: 'RetrieverQueryEngine',
          ...(captureContent && queryText != null
            ? { [ATTR_GEN_AI_INPUT_MESSAGES]: queryText }
            : {}),
        },
      }
    );

    const execContext = getExecContext(span);

    let result: unknown;
    try {
      result = context.with(execContext, () => {
        return original.apply(this, args);
      });
    } catch (error) {
      handleError(span, error);
      throw error;
    }

    const wrappedPromise = Promise.resolve(result)
      .then(res => {
        const responseText =
          res && typeof res === 'object' && 'response' in res
            ? String((res as { response: unknown }).response)
            : typeof res === 'string'
              ? res
              : safelyJSONStringify(res);

        if (captureContent && responseText != null) {
          span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, responseText);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return res;
      })
      .catch(error => {
        handleError(span, error);
        throw error;
      });

    return context.bind(execContext, wrappedPromise);
  };
}

/**
 * Patches BaseRetriever.prototype.retrieve
 */
export function patchRetrieveMethod(
  original: GenericFunction,
  tracer: Tracer,
  config?: LlamaIndexInstrumentationConfig
) {
  return function (this: unknown, ...args: unknown[]) {
    const captureContent = isContentCaptureEnabled(config);
    const queryArg = args[0] as
      | { query?: string; topK?: number }
      | string
      | undefined;
    const queryText =
      typeof queryArg === 'string'
        ? queryArg
        : queryArg && typeof queryArg === 'object' && 'query' in queryArg
          ? queryArg.query
          : safelyJSONStringify(queryArg);

    const topK =
      queryArg && typeof queryArg === 'object' && 'topK' in queryArg
        ? (queryArg as { topK?: number }).topK
        : undefined;

    const span = tracer.startSpan(GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL, {
      kind: SpanKind.INTERNAL,
      attributes: {
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
        ...(queryText != null
          ? { [ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT]: queryText }
          : {}),
        ...(topK != null ? { [ATTR_GEN_AI_RETRIEVAL_TOP_K]: topK } : {}),
      },
    });

    const execContext = getExecContext(span);

    let result: unknown;
    try {
      result = context.with(execContext, () => {
        return original.apply(this, args);
      });
    } catch (error) {
      handleError(span, error);
      throw error;
    }

    const wrappedPromise = Promise.resolve(result)
      .then(res => {
        const docAttributes = formatRetrievedDocuments(res, captureContent);
        if (docAttributes != null) {
          span.setAttribute(ATTR_GEN_AI_RETRIEVAL_DOCUMENTS, docAttributes);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return res;
      })
      .catch(error => {
        handleError(span, error);
        throw error;
      });

    return context.bind(execContext, wrappedPromise);
  };
}

/**
 * Patches BaseEmbedding.prototype.getQueryEmbedding
 */
export function patchQueryEmbeddingMethod(
  original: GenericFunction,
  tracer: Tracer
) {
  return function (this: unknown, ...args: unknown[]) {
    const model = getModelName(this);
    const spanName = model
      ? `${GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS} ${model}`
      : GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS;

    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
        [ATTR_GEN_AI_PROVIDER_NAME]: 'llamaindex',
        ...(model ? { [ATTR_GEN_AI_REQUEST_MODEL]: model } : {}),
      },
    });

    const execContext = getExecContext(span);

    let result: unknown;
    try {
      result = context.with(execContext, () => {
        return original.apply(this, args);
      });
    } catch (error) {
      handleError(span, error);
      throw error;
    }

    const wrappedPromise = Promise.resolve(result)
      .then(res => {
        if (Array.isArray(res)) {
          span.setAttribute(ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT, res.length);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return res;
      })
      .catch(error => {
        handleError(span, error);
        throw error;
      });

    return context.bind(execContext, wrappedPromise);
  };
}
