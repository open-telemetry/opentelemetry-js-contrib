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

import type * as graphqlTypes from 'graphql';
import * as api from '@opentelemetry/api';
import {  SpanNames } from './enum';
import { AttributeNames } from './enums/AttributeNames';
import { OTEL_GRAPHQL_DATA_SYMBOL, OTEL_PATCHED_SYMBOL } from './symbols';
import {
  GraphQLField,
  GraphQLPath,
  GraphQLInstrumentationParsedConfig,
  ObjectWithGraphQLData,
  OtelPatched,
  Maybe,
} from './internal-types';
import { GraphQLToolsExecutorInstrumentationConfig } from './types';
export {
  isPromise,
  addInputVariableAttributes,
  addSpanSource,
  endSpan,
  getOperation,
  wrapFields,
} from '@opentelemetry/instrumentation-graphql/build/src/utils';

import {
  isPromise,
  addSpanSource,
} from '@opentelemetry/instrumentation-graphql/build/src/utils';


// https://github.com/graphql/graphql-js/blob/main/src/jsutils/isObjectLike.ts
const isObjectLike = (value: unknown): value is { [key: string]: unknown } => {
  return typeof value == 'object' && value !== null;
};

function createFieldIfNotExists(
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
  contextValue: any,
  info: graphqlTypes.GraphQLResolveInfo,
  path: string[]
): {
  field: any;
  spanAdded: boolean;
} {
  let field = getField(contextValue, path);

  let spanAdded = false;

  if (!field) {
    spanAdded = true;
    const parent = getParentField(contextValue, path);

    field = {
      parent,
      span: createResolverSpan(
        tracer,
        getConfig,
        contextValue,
        info,
        path,
        parent.span
      ),
      error: null,
    };

    addField(contextValue, path, field);
  }

  return { spanAdded, field };
}

function createResolverSpan(
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
  contextValue: any,
  info: graphqlTypes.GraphQLResolveInfo,
  path: string[],
  parentSpan?: api.Span
): api.Span {
  const attributes: api.SpanAttributes = {
    [AttributeNames.FIELD_NAME]: info.fieldName,
    [AttributeNames.FIELD_PATH]: path.join('.'),
    [AttributeNames.FIELD_TYPE]: info.returnType.toString(),
  };

  const span = tracer.startSpan(
    SpanNames.RESOLVE,
    {
      attributes,
    },
    parentSpan ? api.trace.setSpan(api.context.active(), parentSpan) : undefined
  );

  const document = contextValue[OTEL_GRAPHQL_DATA_SYMBOL].source;
  const fieldNode = info.fieldNodes.find(
    fieldNode => fieldNode.kind === 'Field'
  );

  if (fieldNode) {
    addSpanSource(
      span,
      document.loc,
      getConfig().allowValues,
      fieldNode.loc?.start,
      fieldNode.loc?.end
    );
  }

  return span;
}


function addField(contextValue: any, path: string[], field: GraphQLField) {
  return (contextValue[OTEL_GRAPHQL_DATA_SYMBOL].fields[path.join('.')] =
    field);
}

function getField(contextValue: any, path: string[]) {
  return contextValue[OTEL_GRAPHQL_DATA_SYMBOL].fields[path.join('.')];
}

function getParentField(contextValue: any, path: string[]) {
  for (let i = path.length - 1; i > 0; i--) {
    const field = getField(contextValue, path.slice(0, i));

    if (field) {
      return field;
    }
  }

  return {
    span: contextValue[OTEL_GRAPHQL_DATA_SYMBOL].span,
  };
}

function pathToArray(mergeItems: boolean, path: GraphQLPath): string[] {
  const flattened: string[] = [];
  let curr: GraphQLPath | undefined = path;
  while (curr) {
    let key = curr.key;

    if (mergeItems && typeof key === 'number') {
      key = '*';
    }
    flattened.push(String(key));
    curr = curr.prev;
  }
  return flattened.reverse();
}






const handleResolveSpanError = (
  resolveSpan: api.Span,
  err: any,
  shouldEndSpan: boolean
) => {
  if (!shouldEndSpan) {
    return;
  }
  resolveSpan.recordException(err);
  resolveSpan.setStatus({
    code: api.SpanStatusCode.ERROR,
    message: err.message,
  });
  resolveSpan.end();
};

const handleResolveSpanSuccess = (
  resolveSpan: api.Span,
  shouldEndSpan: boolean
) => {
  if (!shouldEndSpan) {
    return;
  }
  resolveSpan.end();
};

export function wrapFieldResolver<TSource = any, TContext = any, TArgs = any>(
  tracer: api.Tracer,
  getConfig: () => Required<GraphQLToolsExecutorInstrumentationConfig>,
  fieldResolver: Maybe<
    graphqlTypes.GraphQLFieldResolver<TSource, TContext, TArgs> & OtelPatched
  >,
  isDefaultResolver = false
): graphqlTypes.GraphQLFieldResolver<TSource, TContext, TArgs> & OtelPatched {
  if (
    (wrappedFieldResolver as OtelPatched)[OTEL_PATCHED_SYMBOL] ||
    typeof fieldResolver !== 'function'
  ) {
    return fieldResolver!;
  }

  function wrappedFieldResolver(
    this: graphqlTypes.GraphQLFieldResolver<TSource, TContext, TArgs>,
    source: TSource,
    args: TArgs,
    contextValue: TContext & ObjectWithGraphQLData,
    info: graphqlTypes.GraphQLResolveInfo
  ) {
    if (!fieldResolver) {
      return undefined;
    }
    const config = getConfig();

    // follows what graphql is doing to decied if this is a trivial resolver
    // for which we don't need to create a resolve span
    if (
      config.ignoreTrivialResolveSpans &&
      isDefaultResolver &&
      (isObjectLike(source) || typeof source === 'function')
    ) {
      const property = (source as any)[info.fieldName];
      // a function execution is not trivial and should be recorder.
      // property which is not a function is just a value and we don't want a "resolve" span for it
      if (typeof property !== 'function') {
        return fieldResolver.call(this, source, args, contextValue, info);
      }
    }

    if (!contextValue[OTEL_GRAPHQL_DATA_SYMBOL]) {
      return fieldResolver.call(this, source, args, contextValue, info);
    }
    const path = pathToArray(config.mergeItems, info && info.path);
    const depth = path.filter((item: any) => typeof item === 'string').length;

    let field: any;
    let shouldEndSpan = false;
    if (config.depth >= 0 && config.depth < depth) {
      field = getParentField(contextValue, path);
    } else {
      const newField = createFieldIfNotExists(
        tracer,
        getConfig,
        contextValue,
        info,
        path
      );
      field = newField.field;
      shouldEndSpan = newField.spanAdded;
    }

    return api.context.with(
      api.trace.setSpan(api.context.active(), field.span),
      () => {
        try {
          const res = fieldResolver.call(
            this,
            source,
            args,
            contextValue,
            info
          );
          if (isPromise(res)) {
            return res.then(
              (r: any) => {
                handleResolveSpanSuccess(field.span, shouldEndSpan);
                return r;
              },
              (err: Error) => {
                handleResolveSpanError(field.span, err, shouldEndSpan);
                throw err;
              }
            );
          } else {
            handleResolveSpanSuccess(field.span, shouldEndSpan);
            return res;
          }
        } catch (err: any) {
          handleResolveSpanError(field.span, err, shouldEndSpan);
          throw err;
        }
      }
    );
  }

  (wrappedFieldResolver as OtelPatched)[OTEL_PATCHED_SYMBOL] = true;

  return wrappedFieldResolver;
}
