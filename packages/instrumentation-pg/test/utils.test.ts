/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  DiagLogLevel,
  trace,
  DiagLogger,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  TracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  AlwaysOffSampler,
} from '@opentelemetry/sdk-trace';
import * as assert from 'assert';
import * as pg from 'pg';
import { PgInstrumentationConfig } from '../src';
import { AttributeNames } from '../src/enums/AttributeNames';
import { PgClientExtended, PgPoolOptionsParams } from '../src/internal-types';
import * as utils from '../src/utils';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

/**
 * Installs a diag logger that records warnings, so that tests can assert the
 * instrumentation reported a failing hook rather than swallowing it.
 */
const captureDiagWarnings = () => {
  const warnings: string[] = [];
  const logger: DiagLogger = {
    error: () => {},
    warn: message => warnings.push(message),
    info: () => {},
    debug: () => {},
    verbose: () => {},
  };
  diag.setLogger(logger, DiagLogLevel.WARN);
  return warnings;
};

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  user: process.env.POSTGRES_USER || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 54320,
};

const getLatestSpan = () => {
  const spans = memoryExporter.getFinishedSpans();
  return spans[spans.length - 1];
};

describe('utils.ts', () => {
  const client = new pg.Client(CONFIG) as PgClientExtended;
  let contextManager: AsyncLocalStorageContextManager;
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
  });
  const tracer = provider.getTracer('external');
  const nonRecordingProvider = new TracerProvider({
    sampler: new AlwaysOffSampler(),
    spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
  });
  const nonRecordingTracer = nonRecordingProvider.getTracer('external');

  const instrumentationConfig: PgInstrumentationConfig & InstrumentationConfig =
    {};

  beforeEach(() => {
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  describe('.getQuerySpanName()', () => {
    const dummyQuery = {
      text: 'SELECT $1',
      values: ['hello'],
      name: 'select-placeholder-val',
    };

    it('uses prepared statement name when given, over query text', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', dummyQuery),
        'pg.query:select-placeholder-val dbName'
      );
    });

    it('falls back to parsing query text when no (valid) name is available', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { ...dummyQuery, name: undefined }),
        'pg.query:SELECT dbName'
      );
    });

    it('normalizes operation names parsed from query text', () => {
      const queryUpperCase = { text: dummyQuery.text.toUpperCase() };
      const queryLowerCase = { text: dummyQuery.text.toLowerCase() };

      assert.strictEqual(
        utils.getQuerySpanName('dbName', queryUpperCase),
        utils.getQuerySpanName('dbName', queryLowerCase)
      );
    });

    it('ignores trailing semicolons when parsing operation names', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { text: 'COMMIT;' }),
        'pg.query:COMMIT dbName'
      );
    });

    it('remove leading whitespaces when parsing operation names', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { text: ' SELECT $1' }),
        'pg.query:SELECT dbName'
      );
    });

    it('remove trailing whitespaces when parsing operation names', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { text: 'SELECT $1 ' }),
        'pg.query:SELECT dbName'
      );
    });

    it('remove leading and trailing whitespace when parsing operation names', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { text: '  SELECT $1  ' }),
        'pg.query:SELECT dbName'
      );
    });

    it('omits db name if missing', () => {
      assert.strictEqual(
        utils.getQuerySpanName(undefined, dummyQuery),
        'pg.query:select-placeholder-val'
      );
    });

    it('should omit all info if the queryConfig is invalid', () => {
      assert.strictEqual(
        utils.getQuerySpanName('db-name-ignored', undefined),
        'pg.query'
      );
    });
  });

  describe('.parseNormalizedOperationName()', () => {
    it('splits on a tab as well as a space', () => {
      assert.strictEqual(
        utils.parseNormalizedOperationName("SELECT\t'x' FROM t"),
        'SELECT'
      );
    });

    it('splits on a newline', () => {
      assert.strictEqual(
        utils.parseNormalizedOperationName("SELECT\n'secret'"),
        'SELECT'
      );
    });

    it('splits on a carriage return', () => {
      assert.strictEqual(
        utils.parseNormalizedOperationName("UPDATE\r\nt SET c='x'"),
        'UPDATE'
      );
    });

    it('returns the whole trimmed input when it has no whitespace', () => {
      assert.strictEqual(
        utils.parseNormalizedOperationName('  SELECT  '),
        'SELECT'
      );
    });
  });

  describe('.shouldSkipInstrumentation()', () => {
    it('returns false when requireParentSpan=false', async () => {
      assert.strictEqual(
        utils.shouldSkipInstrumentation(instrumentationConfig),
        false
      );
    });

    it('returns false requireParentSpan=true and there is a parent span', async () => {
      const parent = tracer.startSpan('parentSpan');
      context.with(trace.setSpan(context.active(), parent), () => {
        assert.strictEqual(
          utils.shouldSkipInstrumentation({
            ...instrumentationConfig,
            requireParentSpan: true,
          }),
          false
        );
      });
    });

    it('returns true when requireParentSpan=true and there is no parent span', async () => {
      assert.strictEqual(
        utils.shouldSkipInstrumentation({
          ...instrumentationConfig,
          requireParentSpan: true,
        }),
        true
      );
    });
  });

  describe('.maskQueryText()', () => {
    const query = "SELECT * FROM t WHERE a = 'secret' AND b = 42";

    afterEach(() => {
      diag.disable();
    });

    it('applies the default hook when masking is not configured', () => {
      assert.strictEqual(
        utils.maskQueryText(query, {}),
        'SELECT * FROM t WHERE a = ? AND b = ?'
      );
    });

    it('returns the query unchanged when skipQueryTextSanitization is true', () => {
      assert.strictEqual(
        utils.maskQueryText(query, { skipQueryTextSanitization: true }),
        query
      );
    });

    it('applies the default hook when skipQueryTextSanitization is explicitly false', () => {
      assert.strictEqual(
        utils.maskQueryText(query, { skipQueryTextSanitization: false }),
        'SELECT * FROM t WHERE a = ? AND b = ?'
      );
    });

    it('preserves parameter placeholders', () => {
      assert.strictEqual(
        utils.maskQueryText('SELECT * FROM t WHERE a = $1', {
          skipQueryTextSanitization: false,
        }),
        'SELECT * FROM t WHERE a = $1'
      );
    });

    it('applies a custom hook to the raw query text', () => {
      const seen: string[] = [];
      const masked = utils.maskQueryText(query, {
        skipQueryTextSanitization: false,
        maskStatementHook: text => {
          seen.push(text);
          return 'REDACTED';
        },
      });

      assert.strictEqual(masked, 'REDACTED');
      assert.deepStrictEqual(seen, [query]);
    });

    it('does not call the hook when masking is disabled', () => {
      let called = false;
      utils.maskQueryText(query, {
        skipQueryTextSanitization: true,
        maskStatementHook: text => {
          called = true;
          return text;
        },
      });

      assert.strictEqual(called, false);
    });

    it('omits the text and warns when the hook throws', () => {
      const warnings = captureDiagWarnings();
      const masked = utils.maskQueryText(query, {
        skipQueryTextSanitization: false,
        maskStatementHook: () => {
          throw new Error('hook failure');
        },
      });

      assert.strictEqual(masked, undefined);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes('maskStatementHook'));
    });

    for (const [description, value] of [
      ['a non-string', 42],
      ['nothing', undefined],
      ['null', null],
    ] as const) {
      it(`omits the text and warns when the hook returns ${description}`, () => {
        const warnings = captureDiagWarnings();
        const masked = utils.maskQueryText(query, {
          skipQueryTextSanitization: false,
          maskStatementHook: (() => value) as unknown as (q: string) => string,
        });

        assert.strictEqual(masked, undefined);
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].includes('non-string'));
      });
    }

    it('omits the text when masking leaves it empty', () => {
      assert.strictEqual(
        utils.maskQueryText(query, {
          skipQueryTextSanitization: false,
          maskStatementHook: () => '',
        }),
        undefined
      );
    });
  });

  describe('.handleConfigQuery()', () => {
    const queryConfig = {
      text: 'SELECT $1::text',
      values: ['0'],
    };

    it('does not track pg.values by default', async () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        instrumentationConfig,
        queryConfig
      );
      querySpan.end();

      const readableSpan = getLatestSpan();

      const pgValues = readableSpan.attributes[AttributeNames.PG_VALUES];
      assert.strictEqual(pgValues, undefined);
    });

    it('tracks pg.values if enabled explicitly', async () => {
      const extPluginConfig: PgInstrumentationConfig & InstrumentationConfig = {
        ...instrumentationConfig,
        enhancedDatabaseReporting: true,
      };
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        extPluginConfig,
        queryConfig
      );
      querySpan.end();

      const readableSpan = getLatestSpan();

      const pgValues = readableSpan.attributes[AttributeNames.PG_VALUES];
      assert.deepStrictEqual(pgValues, ['0']);
    });

    it('records the query text verbatim by default', () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        instrumentationConfig,
        queryConfig
      );
      querySpan.end();

      assert.strictEqual(
        getLatestSpan().attributes[ATTR_DB_QUERY_TEXT],
        'SELECT $1::text'
      );
    });

    it('never sanitizes the text of a parameterized query, even when sanitization is not skipped', () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        { ...instrumentationConfig, skipQueryTextSanitization: false },
        { text: "SELECT $1::text WHERE label = 'literal'", values: ['0'] }
      );
      querySpan.end();

      assert.strictEqual(
        getLatestSpan().attributes[ATTR_DB_QUERY_TEXT],
        "SELECT $1::text WHERE label = 'literal'"
      );
    });

    it('records masked query text when sanitization is not skipped', () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        { ...instrumentationConfig, skipQueryTextSanitization: false },
        { text: "SELECT 'secret'::text" }
      );
      querySpan.end();

      assert.strictEqual(
        getLatestSpan().attributes[ATTR_DB_QUERY_TEXT],
        'SELECT ?::text'
      );
    });

    it('omits only the query text when the masking hook fails', () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        {
          ...instrumentationConfig,
          skipQueryTextSanitization: false,
          maskStatementHook: () => {
            throw new Error('hook failure');
          },
        },
        { text: queryConfig.text, name: 'a-plan' }
      );
      querySpan.end();

      const readableSpan = getLatestSpan();
      assert.strictEqual(
        readableSpan.attributes[ATTR_DB_QUERY_TEXT],
        undefined
      );
      // The rest of the span is unaffected: a failing hook withholds one
      // attribute rather than degrading the span.
      assert.strictEqual(
        readableSpan.attributes[AttributeNames.PG_PLAN],
        'a-plan'
      );
      assert.strictEqual(
        readableSpan.attributes[ATTR_SERVER_PORT],
        CONFIG.port
      );
    });

    it('still records raw values when enhancedDatabaseReporting is combined with masking', () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        {
          ...instrumentationConfig,
          skipQueryTextSanitization: false,
          enhancedDatabaseReporting: true,
        },
        queryConfig
      );
      querySpan.end();

      const readableSpan = getLatestSpan();
      assert.strictEqual(
        readableSpan.attributes[ATTR_DB_QUERY_TEXT],
        'SELECT $1::text'
      );
      assert.deepStrictEqual(
        readableSpan.attributes[AttributeNames.PG_VALUES],
        ['0']
      );
    });

    it('does not run the masking hook for a non-recording span', () => {
      let called = false;
      const querySpan = utils.handleConfigQuery.call(
        client,
        nonRecordingTracer,
        {
          ...instrumentationConfig,
          skipQueryTextSanitization: false,
          maskStatementHook: (text: string) => {
            called = true;
            return text;
          },
        },
        queryConfig
      );
      querySpan.end();

      assert.strictEqual(called, false);
    });

    it('does not convert values for a non-recording span', () => {
      const value = {
        toPostgres: () => {
          throw new Error('should not be called');
        },
      };
      const querySpan = utils.handleConfigQuery.call(
        client,
        nonRecordingTracer,
        {
          ...instrumentationConfig,
          enhancedDatabaseReporting: true,
        },
        { ...queryConfig, values: [value] }
      );

      assert.doesNotThrow(() => querySpan.end());
    });
  });

  describe('.getSemanticAttributesFromConnection()', () => {
    it('should set port attribute to undefined when port is not an integer', () => {
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: Infinity,
        })[ATTR_SERVER_PORT],
        undefined
      );
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: -Infinity,
        })[ATTR_SERVER_PORT],
        undefined
      );
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: NaN,
        })[ATTR_SERVER_PORT],
        undefined
      );
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: 1.234,
        })[ATTR_SERVER_PORT],
        undefined
      );
    });

    it('should set port attribute when port is an integer', () => {
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: 1234,
        })[ATTR_SERVER_PORT],
        1234
      );
      assert.strictEqual(
        utils.getSemanticAttributesFromConnection({
          port: Number.MAX_VALUE,
        })[ATTR_SERVER_PORT],
        Number.MAX_VALUE
      );
    });
  });

  describe('.getPoolName()', () => {
    it('creation of pool name based on pool config', () => {
      const dummyPool: PgPoolOptionsParams = {
        host: 'host_name',
        port: 1234,
        user: 'username',
        database: 'database_name',
        namespace: 'database_namespace',
        idleTimeoutMillis: 10,
        maxClient: 5,
        max: 5,
        maxUses: 5,
        allowExitOnIdle: true,
        maxLifetimeSeconds: 10,
      };

      assert.strictEqual(
        utils.getPoolName(dummyPool),
        'host_name:1234/database_name'
      );
    });
  });

  describe('.parseAndMaskConnectionString()', () => {
    it('should remove all auth information from connection string', () => {
      const connectionString =
        'postgresql://user:password123@localhost:5432/dbname';
      assert.strictEqual(
        utils.parseAndMaskConnectionString(connectionString),
        'postgresql://localhost:5432/dbname'
      );
    });

    it('should remove username when no password is present', () => {
      const connectionString = 'postgresql://user@localhost:5432/dbname';
      assert.strictEqual(
        utils.parseAndMaskConnectionString(connectionString),
        'postgresql://localhost:5432/dbname'
      );
    });

    it('should preserve connection string when no auth is present', () => {
      const connectionString = 'postgresql://localhost:5432/dbname';
      assert.strictEqual(
        utils.parseAndMaskConnectionString(connectionString),
        'postgresql://localhost:5432/dbname'
      );
    });

    it('should preserve query parameters while removing auth', () => {
      const connectionString =
        'postgresql://user:pass@localhost/dbname?sslmode=verify-full&application_name=myapp';
      assert.strictEqual(
        utils.parseAndMaskConnectionString(connectionString),
        'postgresql://localhost/dbname?sslmode=verify-full&application_name=myapp'
      );
    });

    it('should handle invalid connection string', () => {
      const connectionString = 'not-a-valid-url';
      assert.strictEqual(
        utils.parseAndMaskConnectionString(connectionString),
        'postgresql://localhost:5432/'
      );
    });
  });
});
