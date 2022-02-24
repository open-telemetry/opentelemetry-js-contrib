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
import { Span } from '@opentelemetry/api';
import * as assert from 'assert';
import type * as graphqlTypes from 'graphql';
import { GraphQLInstrumentation } from '../src';
import { SpanNames } from '../src/enum';
import { AttributeNames } from '../src/enums/AttributeNames';
import {
  GraphQLInstrumentationConfig,
  GraphQLInstrumentationExecutionResponseHook,
} from '../src/types';
import { assertResolveSpan } from './helper';

const defaultConfig: GraphQLInstrumentationConfig = {};
const graphQLInstrumentation = new GraphQLInstrumentation(defaultConfig);
graphQLInstrumentation.enable();
graphQLInstrumentation.disable();

// now graphql can be required

import { buildSchema } from './schema';
import { graphql } from 'graphql';
// Construct a schema, using GraphQL schema language
const schema = buildSchema();

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
graphQLInstrumentation.setTracerProvider(provider);

describe('graphql', () => {
  function create(config: GraphQLInstrumentationConfig = {}) {
    graphQLInstrumentation.setConfig(config);
    graphQLInstrumentation.enable();
  }

  describe('when depth is not set', () => {
    describe('AND source is query to get a list of books', () => {
      let spans: ReadableSpan[];
      beforeEach(async () => {
        create({});
        await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 7 spans', () => {
        assert.deepStrictEqual(spans.length, 7);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[6];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[6];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];
        const span2 = spans[4];
        const span3 = spans[5];

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

      it('should execute with correct timing', async () => {
        const PARSE = 0;
        const VALIDATE = 1;
        const RESOLVE = 2;
        const EXECUTE = 6;

        const times = spans.map(s => {
          return {
            start: s.startTime[0] * 1_000 + s.startTime[1] / 1_000_000,
            end: s.endTime[0] * 1_000 + s.endTime[1] / 1_000_000,
          };
        });

        assert.ok(times[PARSE].start <= times[PARSE].end);
        assert.ok(times[PARSE].end <= times[VALIDATE].start);
        assert.ok(times[VALIDATE].start <= times[VALIDATE].end);
        assert.ok(times[VALIDATE].end <= times[EXECUTE].start);
        assert.ok(times[EXECUTE].start <= times[RESOLVE].start);
        assert.ok(times[RESOLVE].end <= times[EXECUTE].end);
      });
    });
    describe('AND source is query with param', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({});
        await graphql(schema, sourceBookById);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    book(id: *) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];

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
        await graphql(schema, sourceFindUsingVariable, null, null, {
          id: 2,
        });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query Query1 ($id: Int!) {\n' +
            '    book(id: $id) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];

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
        await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
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
        await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    books {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
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
        await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 3 spans', () => {
        assert.deepStrictEqual(spans.length, 3);
      });
    });
  });

  describe('when allowValues is set to true', () => {
    describe('AND source is query with param', () => {
      let spans: ReadableSpan[];

      beforeEach(async () => {
        create({
          allowValues: true,
        });
        await graphql(schema, sourceBookById);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query {\n' +
            '    book(id: 0) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];

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
        await graphql(schema, sourceAddBook);
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
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
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];

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
        await graphql(schema, sourceFindUsingVariable, null, null, {
          id: 2,
        });
        spans = exporter.getFinishedSpans();
      });

      afterEach(() => {
        exporter.reset();
        graphQLInstrumentation.disable();
        spans = [];
      });

      it('should have 5 spans', () => {
        assert.deepStrictEqual(spans.length, 5);
      });

      it('should instrument parse', () => {
        const parseSpan = spans[0];
        assert.deepStrictEqual(
          parseSpan.attributes[AttributeNames.SOURCE],
          '\n' +
            '  query Query1 ($id: Int!) {\n' +
            '    book(id: $id) {\n' +
            '      name\n' +
            '    }\n' +
            '  }\n'
        );
        assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
      });

      it('should instrument validate', () => {
        const validateSpan = spans[1];

        assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
        assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      });

      it('should instrument execute', () => {
        const executeSpan = spans[4];

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
        assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
        assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
      });

      it('should instrument resolvers', () => {
        const executeSpan = spans[4];
        const resolveParentSpan = spans[2];
        const span1 = spans[3];

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
      await graphql(schema, sourceAddBook);
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLInstrumentation.disable();
      spans = [];
    });

    it('should have 5 spans', () => {
      assert.deepStrictEqual(spans.length, 5);
    });

    it('should instrument parse', () => {
      const parseSpan = spans[0];
      assert.deepStrictEqual(
        parseSpan.attributes[AttributeNames.SOURCE],
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
      assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
    });

    it('should instrument validate', () => {
      const validateSpan = spans[1];

      assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
      assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
    });

    it('should instrument execute', () => {
      const executeSpan = spans[4];

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
      assert.deepStrictEqual(executeSpan.name, SpanNames.EXECUTE);
      assert.deepStrictEqual(executeSpan.parentSpanId, undefined);
    });

    it('should instrument resolvers', () => {
      const executeSpan = spans[4];
      const resolveParentSpan = spans[2];
      const span1 = spans[3];

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

  describe('when query is not correct', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({});
      await graphql(schema, badQuery);
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLInstrumentation.disable();
      spans = [];
    });

    it('should have 1 span', () => {
      assert.deepStrictEqual(spans.length, 1);
    });

    it('should instrument parse with error', () => {
      const parseSpan = spans[0];
      const event = parseSpan.events[0];

      assert.ok(event);

      assert.deepStrictEqual(
        event.attributes!['exception.type'],
        'GraphQLError'
      );
      assert.ok(event.attributes!['exception.message']);
      assert.ok(event.attributes!['exception.stacktrace']);
      assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
    });
  });

  describe('when query is correct but cannot be validated', () => {
    let spans: ReadableSpan[];

    beforeEach(async () => {
      create({});
      await graphql(schema, queryInvalid);
      spans = exporter.getFinishedSpans();
    });

    afterEach(() => {
      exporter.reset();
      graphQLInstrumentation.disable();
      spans = [];
    });

    it('should have 2 spans', () => {
      assert.deepStrictEqual(spans.length, 2);
    });

    it('should instrument parse with error', () => {
      const parseSpan = spans[0];
      assert.deepStrictEqual(
        parseSpan.attributes[AttributeNames.SOURCE],
        '\n' +
          '  query {\n' +
          '    book(id: "*") {\n' +
          '      name\n' +
          '    }\n' +
          '  }\n'
      );
      assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
    });

    it('should instrument validate', () => {
      const validateSpan = spans[1];

      assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
      assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      const event = validateSpan.events[0];

      assert.deepStrictEqual(event.name, 'exception');
      assert.deepStrictEqual(
        event.attributes!['exception.type'],
        AttributeNames.ERROR_VALIDATION_NAME
      );
      assert.ok(event.attributes!['exception.message']);
    });
  });

  describe('responseHook', () => {
    let spans: ReadableSpan[];
    let graphqlResult: graphqlTypes.ExecutionResult;
    const dataAttributeName = 'graphql_data';

    afterEach(() => {
      exporter.reset();
      graphQLInstrumentation.disable();
      spans = [];
    });

    describe('when responseHook is valid', () => {
      beforeEach(async () => {
        create({
          responseHook: (span: Span, data: graphqlTypes.ExecutionResult) => {
            span.setAttribute(dataAttributeName, JSON.stringify(data));
          },
        });
        graphqlResult = await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      it('should attach response hook data to the resulting spans', () => {
        const querySpan = spans.find(
          span => span.attributes[AttributeNames.OPERATION_TYPE] == 'query'
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
        graphqlResult = await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      it('should not do any harm', () => {
        assert.deepStrictEqual(graphqlResult.data?.books?.length, 13);
      });
    });

    describe('when responseHook is not a function', () => {
      beforeEach(async () => {
        // Cast to unknown so that it's possible to cast to GraphQLInstrumentationExecutionResponseHook later
        const invalidTypeHook = 1234 as unknown;
        create({
          responseHook:
            invalidTypeHook as GraphQLInstrumentationExecutionResponseHook,
        });
        graphqlResult = await graphql(schema, sourceList1);
        spans = exporter.getFinishedSpans();
      });

      it('should not do any harm', () => {
        assert.deepStrictEqual(graphqlResult.data?.books?.length, 13);
      });
    });
  });

  describe('when query operation is not supported', () => {
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
      graphQLInstrumentation.disable();
      spans = [];
    });

    it('should have 3 spans', () => {
      assert.deepStrictEqual(spans.length, 3);
    });

    it('should instrument parse with error', () => {
      const parseSpan = spans[0];
      assert.deepStrictEqual(
        parseSpan.attributes[AttributeNames.SOURCE],
        '\n' +
          '  query {\n' +
          '    book(id: *) {\n' +
          '      name\n' +
          '    }\n' +
          '  }\n'
      );
      assert.deepStrictEqual(parseSpan.name, SpanNames.PARSE);
    });

    it('should instrument validate', () => {
      const validateSpan = spans[1];

      assert.deepStrictEqual(validateSpan.name, SpanNames.VALIDATE);
      assert.deepStrictEqual(validateSpan.parentSpanId, undefined);
      const event = validateSpan.events[0];

      assert.ok(!event);
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
});
