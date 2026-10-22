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
 * Interface representing the instrumentation instance passed to patch functions.
 */
export interface InstrumentationInstance {
  readonly tracer: Tracer;
  getConfig(): LlamaIndexInstrumentationConfig | Record<string, unknown>;
}

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
 * Formats a user input query according to the OpenTelemetry GenAI input messages schema.
 */
export function formatInputMessages(query: string): string {
  const messages = [
    {
      role: 'user',
      parts: [
        {
          type: 'text',
          content: query,
        },
      ],
    },
  ];
  return safelyJSONStringify(messages) ?? query;
}

/**
 * Formats an assistant output response according to the OpenTelemetry GenAI output messages schema.
 */
export function formatOutputMessages(response: string): string {
  const messages = [
    {
      role: 'assistant',
      parts: [
        {
          type: 'text',
          content: response,
        },
      ],
    },
  ];
  return safelyJSONStringify(messages) ?? response;
}

/**
 * Resolves the execution context for the current span.
 */
function getExecContext(span: Span): Context {
  return trace.setSpan(context.active(), span);
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
 * Checks whether a value is an AsyncIterable.
 */
function isAsyncIterable(val: unknown): val is AsyncIterable<unknown> {
  return (
    val != null &&
    typeof val === 'object' &&
    typeof (val as Record<string | symbol, unknown>)[Symbol.asyncIterator] ===
      'function'
  );
}

/**
 * Extracts string text from an engine stream chunk.
 */
function extractChunkText(chunk: unknown): string | undefined {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (chunk != null && typeof chunk === 'object') {
    const c = chunk as Record<string, unknown>;
    if (typeof c.response === 'string') {
      return c.response;
    }
    if (typeof c.delta === 'string') {
      return c.delta;
    }
    if (typeof c.text === 'string') {
      return c.text;
    }
  }
  return safelyJSONStringify(chunk) ?? undefined;
}

/**
 * Wraps an async iterable so that next, return, and throw execute within the workflow context,
 * streaming content is captured, and the workflow span is explicitly finalized on completion,
 * cancellation (e.g. stream.return() before first next()), or error.
 */
function wrapAsyncIterable(
  source: AsyncIterable<unknown>,
  span: Span,
  execContext: Context,
  captureContent: boolean
): AsyncIterable<unknown> {
  const iterator = source[Symbol.asyncIterator]();
  const chunks: string[] = [];
  let spanEnded = false;

  const endSpanOnce = (error?: unknown) => {
    if (spanEnded) return;
    spanEnded = true;
    if (error) {
      handleError(span, error);
    } else {
      if (captureContent && chunks.length > 0) {
        span.setAttribute(
          ATTR_GEN_AI_OUTPUT_MESSAGES,
          formatOutputMessages(chunks.join(''))
        );
      }
      span.end();
    }
  };

  const wrappedIterator: AsyncIterator<unknown> = {
    next(...args: [] | [unknown]) {
      return context.with(execContext, () => {
        let nextPromise: unknown;
        try {
          nextPromise = iterator.next(...args);
        } catch (error) {
          endSpanOnce(error);
          return Promise.reject(error);
        }

        return Promise.resolve(nextPromise)
          .then(result => {
            if (result.done) {
              endSpanOnce();
            } else if (captureContent && result.value != null) {
              const text = extractChunkText(result.value);
              if (text) {
                chunks.push(text);
              }
            }
            return result;
          })
          .catch(error => {
            endSpanOnce(error);
            throw error;
          });
      });
    },

    return(value?: unknown) {
      return context.with(execContext, () => {
        let returnPromise: unknown;
        try {
          if (typeof iterator.return === 'function') {
            returnPromise = iterator.return(value);
          } else {
            returnPromise = { done: true, value };
          }
        } catch (error) {
          endSpanOnce(error);
          return Promise.reject(error);
        }

        return Promise.resolve(returnPromise)
          .then(result => {
            if (result.done) {
              endSpanOnce();
            } else if (captureContent && result.value != null) {
              const text = extractChunkText(result.value);
              if (text) {
                chunks.push(text);
              }
            }
            return result;
          })
          .catch(error => {
            endSpanOnce(error);
            throw error;
          });
      });
    },

    throw(error?: unknown) {
      return context.with(execContext, () => {
        let throwPromise: unknown;
        try {
          if (typeof iterator.throw === 'function') {
            throwPromise = iterator.throw(error);
          } else {
            throwPromise = Promise.reject(error);
          }
        } catch (err) {
          endSpanOnce(err);
          return Promise.reject(err);
        }

        return Promise.resolve(throwPromise)
          .then(result => {
            if (result.done) {
              endSpanOnce();
            } else if (captureContent && result.value != null) {
              const text = extractChunkText(result.value);
              if (text) {
                chunks.push(text);
              }
            }
            return result;
          })
          .catch(err => {
            endSpanOnce(err);
            throw err;
          });
      });
    },
  };

  return {
    [Symbol.asyncIterator]() {
      return wrappedIterator;
    },
  };
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
        : (node?.text ?? node?.content)
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
 * Reads topK from the retriever instance or query arguments.
 */
function getRetrieverTopK(
  retriever: unknown,
  queryArg: unknown
): number | undefined {
  if (retriever != null && typeof retriever === 'object') {
    const r = retriever as Record<string, unknown>;
    if (typeof r.topK === 'number') {
      return r.topK;
    }
    if (r.topK != null && typeof r.topK === 'object') {
      const topKObj = r.topK as Record<string, unknown>;
      if (typeof topKObj.text === 'number') {
        return topKObj.text;
      }
    }
  }
  if (queryArg != null && typeof queryArg === 'object' && 'topK' in queryArg) {
    const k = (queryArg as { topK?: unknown }).topK;
    if (typeof k === 'number') {
      return k;
    }
  }
  return undefined;
}

/**
 * Patches RetrieverQueryEngine.prototype.query
 */
export function patchQueryEngineQueryMethod(
  instrumentation: InstrumentationInstance,
  original: GenericFunction
) {
  return function (this: unknown, ...args: unknown[]) {
    const tracer = instrumentation.tracer;
    const config = instrumentation.getConfig() as
      | LlamaIndexInstrumentationConfig
      | undefined;
    const captureContent = isContentCaptureEnabled(config);
    const queryArg = args[0] as { query?: string } | string | undefined;
    const queryText =
      typeof queryArg === 'string'
        ? queryArg
        : queryArg && typeof queryArg === 'object' && 'query' in queryArg
          ? queryArg.query
          : safelyJSONStringify(queryArg);

    const attributes: Record<string, string> = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      [ATTR_GEN_AI_WORKFLOW_NAME]: 'RetrieverQueryEngine',
    };

    if (captureContent && queryText != null) {
      attributes[ATTR_GEN_AI_INPUT_MESSAGES] = formatInputMessages(queryText);
    }

    const span = tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW} RetrieverQueryEngine`,
      {
        kind: SpanKind.INTERNAL,
        attributes,
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

    if (isAsyncIterable(result)) {
      return wrapAsyncIterable(result, span, execContext, captureContent);
    }

    const wrappedPromise = Promise.resolve(result)
      .then(res => {
        if (isAsyncIterable(res)) {
          return wrapAsyncIterable(res, span, execContext, captureContent);
        }

        const responseText =
          res && typeof res === 'object' && 'response' in res
            ? String((res as { response: unknown }).response)
            : typeof res === 'string'
              ? res
              : safelyJSONStringify(res);

        if (captureContent && responseText != null) {
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            formatOutputMessages(responseText)
          );
        }

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
  instrumentation: InstrumentationInstance,
  original: GenericFunction
) {
  return function (this: unknown, ...args: unknown[]) {
    const tracer = instrumentation.tracer;
    const config = instrumentation.getConfig() as
      | LlamaIndexInstrumentationConfig
      | undefined;
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

    const topK = getRetrieverTopK(this, queryArg);

    const attributes: Record<string, string | number> = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
    };

    if (topK != null) {
      attributes[ATTR_GEN_AI_RETRIEVAL_TOP_K] = topK;
    }

    if (captureContent && queryText != null) {
      attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT] = queryText;
    }

    const span = tracer.startSpan(GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL, {
      kind: SpanKind.INTERNAL,
      attributes,
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
        if (captureContent) {
          const docAttributes = formatRetrievedDocuments(res, true);
          if (docAttributes != null) {
            span.setAttribute(ATTR_GEN_AI_RETRIEVAL_DOCUMENTS, docAttributes);
          }
        }

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
  instrumentation: InstrumentationInstance,
  original: GenericFunction
) {
  return function (this: unknown, ...args: unknown[]) {
    const tracer = instrumentation.tracer;
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
