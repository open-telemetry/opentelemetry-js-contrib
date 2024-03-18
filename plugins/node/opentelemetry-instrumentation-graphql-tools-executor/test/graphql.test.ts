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
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { Span, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import type * as graphqlTypes from 'graphql';
import { GraphQLToolsExecutorInstrumentation } from '../src';
import { SpanNames } from '../src/enum';
import { AttributeNames } from '../src/enums/AttributeNames';
import {
  GraphQLToolsExecutorInstrumentationConfig,
  GraphQLToolsExecutorInstrumentationExecutionResponseHook,
} from '../src/types';
import { assertResolveSpan } from './helper';

const defaultConfig: GraphQLToolsExecutorInstrumentationConfig = {};
const graphQLToolsExecutorInstrumentation =
  new GraphQLToolsExecutorInstrumentation(defaultConfig);
graphQLToolsExecutorInstrumentation.enable();
graphQLToolsExecutorInstrumentation.disable();

// now graphql can be required
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  buildSchema,
  graphqlSync,
} from 'graphql';
import { buildTestSchema } from './schema';
import { graphql } from './graphql-adaptor';

// Construct a schema, using GraphQL schema language
const schema = buildTestSchema();

const sourceList1 = `
  query {
    books {
      name
    }
  }
`;

const sourceBookById = `
  query {
    book(id: 0) {
      name
    }
  }
`;

const sourceAddBook = `
  mutation AddBook {
    addBook(
      name: "Fifth Book"
      authorIds: "0,2"
    ) {
      id
    }
  }
`;

const sourceFindUsingVariable = `
  query Query1 ($id: Int!) {
    book(id: $id) {
      name
    }
  }
`;

const badQuery = `
  query foo bar
`;

const queryInvalid = `
  query {
    book(id: "a") {
      name
    }
  }
`;

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
graphQLToolsExecutorInstrumentation.setTracerProvider(provider);

describe('graphql', () => {
  function create(config: GraphQLToolsExecutorInstrumentationConfig = {}) {
    graphQLToolsExecutorInstrumentation.setConfig(config);
    graphQLToolsExecutorInstrumentation.enable();
  }

  describe('when depth is not set', () => {
    describe('AND source is query to get a list of books', () => {
      let spans: ReadableSpan[];
      beforeEach(async () => {
        create({});
        await graphql({ schema, source: sourceList1 });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];
        const span2 = spans[2];
        const span3 = spans[3];

        assertResolveSpan(
          resolveParentSpan,
          'books',
          'books',
          '[Book]',
          'books {\n' + '      name\n' + '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(
          span1,
          'name',
          'books.0.name',
          'String',
          'name',
          parentId
        );
        assertResolveSpan(
          span2,
          'name',
          'books.1.name',
          'String',
          'name',
          parentId
        );
        assertResolveSpan(
          span3,
          'name',
          'books.2.name',
          'String',
          'name',
          parentId
        );
      });
    });
    describe('AND source is query with param', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({});
        await graphql({ schema, source: sourceBookById });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    book(id: *) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[2];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];

        assertResolveSpan(
          resolveParentSpan,
          'book',
          'book',
          'Book',
          'book(id: *) {\n' + '      name\n' + '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(
          span1,
          'name',
          'book.name',
          'String',
          'name',
          parentId
        );
      });
    });
    describe('AND source is query with param and variables', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({});
        await graphql({
          schema,
          source: sourceFindUsingVariable,
          variableValues: {
            id: 2,
          },
        });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query Query1 ($id: Int!) {\n' +
            '    book(id: $id) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          'Query1'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[`${AttributeNames.VARIABLES}id`],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query Query1');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[2];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];

        assertResolveSpan(
          resolveParentSpan,
          'book',
          'book',
          'Book',
          'book(id: $id) {\n' + '      name\n' + '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(
          span1,
          'name',
          'book.name',
          'String',
          'name',
          parentId
        );
      });
    });
  });

  describe('when depth is set to 0', () => {
    describe('AND source is query to get a list of books', () => {
      let spans: ReadableSpan[];
      beforeEach(async () => {
        create({
          depth: 0,
        });
        await graphql({ schema, source: sourceList1 });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 1);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[0];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });
    });
  });

  describe('when mergeItems is set to true', () => {
    describe('AND source is query to get a list of books', () => {
      let spans: ReadableSpan[];
      beforeEach(async () => {
        create({
          mergeItems: true,
        });
        await graphql({ schema, source: sourceList1 });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });
    });

    describe('AND depth is set to 0', () => {
      let spans: ReadableSpan[];
      beforeEach(async () => {
        create({
          mergeItems: true,
          depth: 0,
        });
        await graphql({ schema, source: sourceList1 });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 1);
      });
    });
  });

  describe('when ignoreTrivialResolveSpans is set to true', () => {
    beforeEach(() => {
      create({
        ignoreTrivialResolveSpans: true,
      });
    });

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
    });

    it('should create span for resolver defined on schema', async () => {
      const simpleSchemaWithResolver = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'RootQueryType',
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

      await graphql({ schema: simpleSchemaWithResolver, source: '{ hello }' });
      const resovleSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name === SpanNames.RESOLVE);
      assert.deepStrictEqual(resovleSpans.length, 1);
      const resolveSpan = resovleSpans[0];
      assert(resolveSpan.attributes[AttributeNames.FIELD_PATH] === 'hello');
    });

    it('should create span for resolver function', async () => {
      const schema = buildSchema(`
        type Query {
          hello: String
        }
      `);

      const rootValue = {
        hello: () => 'world',
      };

      await graphql({ schema, source: '{ hello }', rootValue });
      const resovleSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name === SpanNames.RESOLVE);
      assert.deepStrictEqual(resovleSpans.length, 1);
      const resolveSpan = resovleSpans[0];
      assert(resolveSpan.attributes[AttributeNames.FIELD_PATH] === 'hello');
    });

    it('should NOT create span for resolver property', async () => {
      const schema = buildSchema(`
        type Query {
          hello: String
        }
      `);

      const rootValue = {
        hello: 'world', // regular property, not a function
      };

      await graphql({ schema, source: '{ hello }', rootValue });
      const resovleSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name === SpanNames.RESOLVE);
      assert.deepStrictEqual(resovleSpans.length, 0);
    });

    it('should create resolve span for custom field resolver', async () => {
      const schema = buildSchema(`
        type Query {
          hello: String
        }
      `);

      const rootValue = {
        hello: 'world', // regular property, not a function
      };

      // since we use a custom field resolver, we record a span
      // even though the field is a property
      const fieldResolver = (
        source: any,
        args: any,
        context: any,
        info: any
      ) => {
        return source[info.fieldName];
      };

      await graphql({ schema, source: '{ hello }', rootValue, fieldResolver });
      const resovleSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name === SpanNames.RESOLVE);
      assert.deepStrictEqual(resovleSpans.length, 1);
      const resolveSpan = resovleSpans[0];
      assert(resolveSpan.attributes[AttributeNames.FIELD_PATH] === 'hello');
    });
  });

  describe('when allowValues is set to true', () => {
    describe('AND source is query with param', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({
          allowValues: true,
        });
        await graphql({ schema, source: sourceBookById });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    book(id: 0) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          undefined
        );
        assert.deepStrictEqual(executeSpan.name, 'query');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[2];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];

        assertResolveSpan(
          resolveParentSpan,
          'book',
          'book',
          'Book',
          'book(id: 0) {\n' + '      name\n' + '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(
          span1,
          'name',
          'book.name',
          'String',
          'name',
          parentId
        );
      });
    });
    describe('AND mutation is called', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({
          allowValues: true,
        });
        await graphql({ schema, source: sourceAddBook });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  mutation AddBook {\n' +
            '    addBook(\n' +
            '      name: "Fifth Book"\n' +
            '      authorIds: "0,2"\n' +
            '    ) {\n' +
            '      id\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'mutation'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          'AddBook'
        );
        assert.deepStrictEqual(executeSpan.name, 'mutation AddBook');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[2];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];

        assertResolveSpan(
          resolveParentSpan,
          'addBook',
          'addBook',
          'Book',
          'addBook(\n' +
            '      name: "Fifth Book"\n' +
            '      authorIds: "0,2"\n' +
            '    ) {\n' +
            '      id\n' +
            '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(span1, 'id', 'addBook.id', 'Int', 'id', parentId);
      });
    });
    describe('AND source is query with param and variables', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({
          allowValues: true,
        });
        await graphql({
          schema,
          source: sourceFindUsingVariable,
          variableValues: {
            id: 2,
          },
        });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLToolsExecutorInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[2];

        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query Query1 ($id: Int!) {\n' +
            '    book(id: $id) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_TYPE],
          'query'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[AttributeNames.OPERATION_NAME],
          'Query1'
        );
        assert.deepStrictEqual(
          executeSpan.attributes[`${AttributeNames.VARIABLES}id`],
          2
        );
        assert.deepStrictEqual(executeSpan.name, 'query Query1');
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[2];
        const resolveParentSpan = spans[0];
        const span1 = spans[1];

        assertResolveSpan(
          resolveParentSpan,
          'book',
          'book',
          'Book',
          'book(id: $id) {\n' + '      name\n' + '    }',
          executeSpan.spanContext().spanId
        );
        const parentId = resolveParentSpan.spanContext().spanId;
        assertResolveSpan(
          span1,
          'name',
          'book.name',
          'String',
          'name',
          parentId
        );
      });
    });
  });

  describe('when mutation is called', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({
        // allowValues: true
      });
      await graphql({ schema, source: sourceAddBook });
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
      spans = [];
    });

    it('should have 3 spans', () => {
      assert.deepStrictEqual(spans.length, 3);
    });

    it('should instrument execute', () => {
      const executeSpan = spans[2];

      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.SOURCE],
        '\n' +
          '  mutation AddBook {\n' +
          '    addBook(\n' +
          '      name: "*"\n' +
          '      authorIds: "*"\n' +
          '    ) {\n' +
          '      id\n' +
          '    }\n' +
          '  }\n'
      );
      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.OPERATION_TYPE],
        'mutation'
      );
      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.OPERATION_NAME],
        'AddBook'
      );
      assert.deepStrictEqual(executeSpan.name, 'mutation AddBook');
      assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
    });

    it('should instrument resolvers', () => {
      const executeSpan = spans[2];
      const resolveParentSpan = spans[0];
      const span1 = spans[1];

      assertResolveSpan(
        resolveParentSpan,
        'addBook',
        'addBook',
        'Book',
        'addBook(\n' +
          '      name: "*"\n' +
          '      authorIds: "*"\n' +
          '    ) {\n' +
          '      id\n' +
          '    }',
        executeSpan.spanContext().spanId
      );
      const parentId = resolveParentSpan.spanContext().spanId;
      assertResolveSpan(span1, 'id', 'addBook.id', 'Int', 'id', parentId);
    });
  });

  describe.skip('when query is not correct', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({});
      await graphql({ schema, source: badQuery });
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
      spans = [];
    });

    it('should have 1 span', () => {
      assert.deepStrictEqual(spans.length, 1);
    });
  });

  describe.skip('when query is correct but cannot be validated', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({});
      await graphql({ schema, source: queryInvalid });
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
      spans = [];
    });

    it('should have 2 spans', () => {
      assert.deepStrictEqual(spans.length, 2);
    });
  });

  describe('responseHook', () => {
    let spans: ReadableSpan[];
    let graphqlResult: graphqlTypes.ExecutionResult<{ books: unknown[] }>;
    const dataAttributeName = 'graphql_data';

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
      spans = [];
    });

    describe('when responseHook is valid', () => {
      beforeEach(async () => {
        create({
          responseHook: (span: Span, data: graphqlTypes.ExecutionResult) => {
            span.setAttribute(dataAttributeName, JSON.stringify(data));
          },
        });
        const mayBeAsyncIterableResult = await graphql({
          schema,
          source: sourceList1,
        });
        if (Symbol.asyncIterator in mayBeAsyncIterableResult) {
          throw new Error('Expected a synchronous result');
        }
        graphqlResult = mayBeAsyncIterableResult;
        spans = exporter.getFinishedSpans();
      });

      it('should attach response hook data to the resulting spans', () => {
        const querySpan = spans.find(
          span => span.attributes[AttributeNames.OPERATION_TYPE] === 'query'
        );
        const instrumentationResult = querySpan?.attributes[dataAttributeName];
        assert.deepStrictEqual(
          instrumentationResult,
          JSON.stringify(graphqlResult)
        );
      });
    });

    describe('when responseHook throws an error', () => {
      beforeEach(async () => {
        create({
          responseHook: (_span: Span, _data: graphqlTypes.ExecutionResult) => {
            throw 'some kind of failure!';
          },
        });
        const mayBeAsyncIterableResult = await graphql({
          schema,
          source: sourceList1,
        });
        if (Symbol.asyncIterator in mayBeAsyncIterableResult) {
          throw new Error('Expected a synchronous result');
        }
        graphqlResult = mayBeAsyncIterableResult;
        spans = exporter.getFinishedSpans();
      });

      it('should not do any harm', () => {
        assert.deepStrictEqual(graphqlResult.data?.books?.length, 9);
      });
    });

    describe('when responseHook is not a function', () => {
      beforeEach(async () => {
        // Cast to unknown so that it's possible to cast to GraphQLInstrumentationExecutionResponseHook later
        const invalidTypeHook = 1234 as unknown;
        create({
          responseHook:
            invalidTypeHook as GraphQLToolsExecutorInstrumentationExecutionResponseHook,
        });
        const mayBeAsyncIterableResult = await graphql({
          schema,
          source: sourceList1,
        });
        if (Symbol.asyncIterator in mayBeAsyncIterableResult) {
          throw new Error('Expected a synchronous result');
        }
        graphqlResult = mayBeAsyncIterableResult;
        spans = exporter.getFinishedSpans();
      });

      it('should not do any harm', () => {
        assert.deepStrictEqual(graphqlResult.data?.books?.length, 9);
      });
    });
  });

  describe.skip('when query operation is not supported', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({});
      await graphql({
        schema,
        source: sourceBookById,
        operationName: 'foo',
      });
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLToolsExecutorInstrumentation.disable();
      spans = [];
    });

    it('should have 3 spans', () => {
      assert.deepStrictEqual(spans.length, 3);
    });

    it('should instrument execute', () => {
      const executeSpan = spans[2];

      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.SOURCE],
        '\n' +
          '  query {\n' +
          '    book(id: *) {\n' +
          '      name\n' +
          '    }\n' +
          '  }\n'
      );
      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.OPERATION_NAME],
        'Operation "foo" not supported'
      );
      assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
      assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
    });
  });

  describe.skip('graphqlSync', () => {
    const simpleSyncSchema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    beforeEach(() => {
      create({});
    });

    afterEach(() => {
      exporter.reset();
    });

    it('should instrument successful graphqlSync', () => {
      const rootValue = {
        hello: () => 'Hello world!',
      };
      const source = '{ hello }';

      const res = graphqlSync({ schema: simpleSyncSchema, rootValue, source });
      assert.deepEqual(res.data, { hello: 'Hello world!' });

      // validate execute span is present
      const spans = exporter.getFinishedSpans();
      const executeSpans = spans.filter(s => s.name === 'query');
      assert.deepStrictEqual(executeSpans.length, 1);
      const [executeSpan] = executeSpans;
      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.SOURCE],
        source
      );
      assert.deepStrictEqual(
        executeSpan.attributes[AttributeNames.OPERATION_TYPE],
        'query'
      );
    });

    it('should instrument when sync resolver throws', () => {
      const rootValue = {
        hello: () => {
          throw Error('sync resolver error from tests');
        },
      };
      const source = '{ hello }';

      // graphql will not throw, it will return "errors" in the result and the field will be null
      const res = graphqlSync({ schema: simpleSyncSchema, rootValue, source });
      assert.deepEqual(res.data, { hello: null });

      // assert errors are returned correctly
      assert.deepStrictEqual(res.errors?.length, 1);
      const resolverError = res.errors?.[0];
      assert.deepStrictEqual(resolverError.path, ['hello']);
      assert.deepStrictEqual(
        resolverError.message,
        'sync resolver error from tests'
      );

      // assert relevant spans are still created with error indications
      const spans = exporter.getFinishedSpans();

      // single resolve span with error and event for exception
      const resolveSpans = spans.filter(s => s.name === SpanNames.RESOLVE);
      assert.deepStrictEqual(resolveSpans.length, 1);
      const resolveSpan = resolveSpans[0];
      assert.deepStrictEqual(resolveSpan.status.code, SpanStatusCode.ERROR);
      assert.deepStrictEqual(
        resolveSpan.status.message,
        'sync resolver error from tests'
      );
      const resolveEvent = resolveSpan.events[0];
      assert.deepStrictEqual(resolveEvent.name, 'exception');
      assert.deepStrictEqual(
        resolveEvent.attributes?.[SemanticAttributes.EXCEPTION_MESSAGE],
        'sync resolver error from tests'
      );

      // single execute span
      const executeSpans = spans.filter(s => s.name === 'query');
      assert.deepStrictEqual(executeSpans.length, 1);
    });
  });
});
