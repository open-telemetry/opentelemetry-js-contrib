/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  GraphQLFieldResolver,
  GraphQLSchema,
  GraphQLTypeResolver,
  Source,
} from 'graphql';
import {
  graphql as origAsyncGraphQl,
  graphqlSync as origSyncGraphQl,
  version,
} from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';

interface GraphQLArgs {
  schema: GraphQLSchema;
  source: string | Source;
  rootValue?: unknown;
  contextValue?: unknown;
  variableValues?: Maybe<{
    readonly [variable: string]: unknown;
  }>;
  operationName?: Maybe<string>;
  fieldResolver?: Maybe<GraphQLFieldResolver<any, any>>;
  typeResolver?: Maybe<GraphQLTypeResolver<any, any>>;
}

const executeGraphqlQuery = (queryFunc: Function, args: GraphQLArgs) => {
  const pre16Version =
    !version || version.startsWith('14.') || version.startsWith('15.');
  if (pre16Version) {
    return queryFunc(
      args.schema,
      args.source,
      args.rootValue,
      args.contextValue,
      args.variableValues,
      args.operationName,
      args.fieldResolver,
      args.typeResolver
    );
  } else {
    return queryFunc(args);
  }
};

export const graphql = (args: GraphQLArgs) =>
  executeGraphqlQuery(origAsyncGraphQl, args);
export const graphqlSync = (args: GraphQLArgs) =>
  executeGraphqlQuery(origSyncGraphQl, args);
