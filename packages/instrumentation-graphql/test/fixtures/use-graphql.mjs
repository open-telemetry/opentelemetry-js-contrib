/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use graphql from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-graphql.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { GraphQLInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-graphql',
  instrumentations: [new GraphQLInstrumentation()],
});
sdk.start();

const { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } =
  await import('graphql');

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      hello: {
        type: GraphQLString,
        resolve() {
          return 'world';
        },
      },
    },
  }),
});

const tracer = trace.getTracer('test-fixture');
await tracer.startActiveSpan('manual', async span => {
  await graphql({ schema, source: '{ hello }' });
  span.end();
});

await sdk.shutdown();
