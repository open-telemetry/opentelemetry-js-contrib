/*
 * Copyright The OpenTelemetry Authors, Aspecto
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
import { strict as assert } from 'assert';
import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_TRANSPORT,
} from '@opentelemetry/semantic-conventions';
import {
  registerInstrumentationTesting,
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { concat } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { gt as semverGt } from 'semver';
import { Neo4jInstrumentation } from '../src/neo4j';
import { ATTR_DB_USER } from '../src/semconv';

const port = Number(process.env.NEO4J_PORT) || 7687;
const host = process.env.NEO4J_HOST || '127.0.0.1';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'secret';

const instrumentation = registerInstrumentationTesting(
  new Neo4jInstrumentation()
);

import neo4j, { Driver } from 'neo4j-driver';
import { normalizeResponse } from './utils';

const shouldTest = process.env.RUN_NEO4J_TESTS;

function assertSpan(span: ReadableSpan) {
  assert.strictEqual(span.kind, SpanKind.CLIENT);
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  assert.strictEqual(span.attributes[ATTR_DB_SYSTEM_NAME], 'neo4j');
  assert.strictEqual(span.attributes[ATTR_DB_NAMESPACE], 'neo4j');
  assert.strictEqual(span.attributes[ATTR_DB_USER], user);
  assert.strictEqual(span.attributes[ATTR_NETWORK_PEER_ADDRESS], host);
  assert.strictEqual(span.attributes[ATTR_NETWORK_PEER_PORT], port);
  assert.strictEqual(span.attributes[ATTR_NETWORK_TRANSPORT], 'TCP');
}

describe('neo4j instrumentation', () => {
  let driver: Driver;

  const getSingleSpan = () => {
    const spans = getTestSpans();
    assert.equal(spans.length, 1);
    return spans[0];
  };

  before(function () {
    if (!shouldTest) {
      this.skip();
    }
  });

  before(async () => {
    driver = neo4j.driver(
      `bolt://${host}:${port}`,
      neo4j.auth.basic(user, password),
      {
        disableLosslessIntegers: true,
      }
    );

    let keepChecking = true;
    const timeoutId = setTimeout(() => {
      keepChecking = false;
    }, 8000);
    while (keepChecking) {
      try {
        await driver.verifyConnectivity();
        clearTimeout(timeoutId);
        return;
      } catch (err) {
        await new Promise(res => setTimeout(res, 1000));
      }
    }
    throw new Error('Could not connect to neo4j in allowed time frame');
  });

  after(async () => {
    if (shouldTest) {
      await driver.close();
    }
  });

  beforeEach(async () => {
    await driver.session().run('MATCH (n) DETACH DELETE n');
    resetMemoryExporter();
  });

  afterEach(async () => {
    instrumentation.setConfig({});
  });

  describe('session', () => {
    it('instruments "run" with promise', async () => {
      const res = await driver.session().run('CREATE (n:MyLabel) RETURN n');

      assert.equal(res.records.length, 1);
      assert.deepStrictEqual((res.records[0].toObject() as any).n.labels, [
        'MyLabel',
      ]);

      const span = getSingleSpan();
      assertSpan(span);
      assert.strictEqual(span.name, 'CREATE neo4j');
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'CREATE');
      assert.strictEqual(
        span.attributes[ATTR_DB_QUERY_TEXT],
        'CREATE (n:MyLabel) RETURN n'
      );
    });

    it('instruments "run" with subscribe', done => {
      driver
        .session()
        .run('CREATE (n:MyLabel) RETURN n')
        .subscribe({
          onCompleted: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.strictEqual(
              span.attributes[ATTR_DB_OPERATION_NAME],
              'CREATE'
            );
            assert.strictEqual(
              span.attributes[ATTR_DB_QUERY_TEXT],
              'CREATE (n:MyLabel) RETURN n'
            );
            done();
          },
          onError(err) {
            done(err);
          },
        });
    });

    it('handles "run" exceptions with promise', async () => {
      try {
        await driver.session().run('NOT_EXISTS_OPERATION');
      } catch (err: unknown) {
        const span = getSingleSpan();
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(span.status.message, (err as Error).message);
        return;
      }
      throw Error('should not be here');
    });

    it('handles "run" exceptions with subscribe', done => {
      driver
        .session()
        .run('NOT_EXISTS_OPERATION')
        .subscribe({
          onError: err => {
            const span = getSingleSpan();
            assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
            assert.strictEqual(span.status.message, err.message);
            done();
          },
        });
    });

    it('closes span when on "onKeys" event', done => {
      driver
        .session()
        .run('MATCH (n) RETURN n')
        .subscribe({
          onKeys: keys => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.deepStrictEqual(keys, ['n']);
            done();
          },
        });
    });

    it('when passing "onKeys" and onCompleted, span is closed in onCompleted, and response hook is called', done => {
      instrumentation.setConfig({
        responseHook: span => span.setAttribute('test', 'cool'),
      });

      driver
        .session()
        .run('MATCH (n) RETURN n')
        .subscribe({
          onKeys: () => {
            const spans = getTestSpans();
            assert.strictEqual(spans.length, 0);
          },
          onCompleted: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.strictEqual(span.attributes['test'], 'cool');
            done();
          },
        });
    });

    it('handles multiple promises', async () => {
      await Promise.all([
        driver.session().run('MATCH (n) RETURN n'),
        driver.session().run('MATCH (k) RETURN k'),
        driver.session().run('MATCH (d) RETURN d'),
      ]);
      const spans = getTestSpans();
      assert.strictEqual(spans.length, 3);
      for (const span of spans) {
        assertSpan(span);
        assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'MATCH');
      }
    });

    it('captures operation with trailing white spaces', async () => {
      await driver.session().run('  MATCH (k) RETURN k ');
      const span = getSingleSpan();
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'MATCH');
    });

    it('does not capture any span when ignoreOrphanedSpans is set to true', async () => {
      instrumentation.setConfig({ ignoreOrphanedSpans: true });
      await context.with(ROOT_CONTEXT, async () => {
        await driver.session().run('CREATE (n:MyLabel) RETURN n');
      });

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 0);
    });

    it('does capture span when ignoreOrphanedSpans is set to true and has parent span', async () => {
      instrumentation.setConfig({ ignoreOrphanedSpans: true });
      const parent = trace
        .getTracerProvider()
        .getTracer('test-tracer')
        .startSpan('main');
      await context.with(trace.setSpan(context.active(), parent), () => {
        return driver.session().run('CREATE (n:MyLabel) RETURN n');
      });

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 1);
    });

    it('responseHook works with promise', async () => {
      instrumentation.setConfig({
        responseHook: (span, response) => {
          span.setAttribute('db.response', normalizeResponse(response));
        },
      });

      const res = await driver
        .session()
        .run(
          'CREATE (n:Rick), (b:Meeseeks { purpose: "help"}), (c:Morty) RETURN *'
        );
      assert.strictEqual(res.records.length, 1);

      const span = getSingleSpan();
      assertSpan(span);
      assert.deepStrictEqual(
        JSON.parse(span.attributes['db.response'] as string),
        [
          {
            b: { labels: ['Meeseeks'], properties: { purpose: 'help' } },
            c: { labels: ['Morty'], properties: {} },
            n: { labels: ['Rick'], properties: {} },
          },
        ]
      );
    });

    it('responseHook works with subscribe', done => {
      instrumentation.setConfig({
        responseHook: (span, response) => {
          span.setAttribute('db.response', normalizeResponse(response));
        },
      });

      driver
        .session()
        .run(
          'CREATE (n:Rick), (b:Meeseeks { purpose: "help"}), (c:Morty) RETURN *'
        )
        .subscribe({
          onCompleted: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.deepStrictEqual(
              JSON.parse(span.attributes['db.response'] as string),
              [
                {
                  b: { labels: ['Meeseeks'], properties: { purpose: 'help' } },
                  c: { labels: ['Morty'], properties: {} },
                  n: { labels: ['Rick'], properties: {} },
                },
              ]
            );
            done();
          },
        });
    });

    it('does not fail when responseHook throws', async () => {
      instrumentation.setConfig({
        responseHook: () => {
          throw new Error('I throw..');
        },
      });
      await driver.session().run('CREATE (n:MyLabel) RETURN n');
      const span = getSingleSpan();
      assertSpan(span);
    });
  });

  describe('transaction', async () => {
    it('instruments session executeRead/readTransaction', async () => {
      // https://github.com/neo4j/neo4j-javascript-driver/wiki/6.x-changelog#-removals
      const version = require('neo4j-driver/package.json').version;
      const method = semverGt(version, '6.0.0')
        ? 'executeRead'
        : 'readTransaction';

      await driver.session()[method as 'executeRead'](txc => {
        return txc.run('MATCH (person:Person) RETURN person.name AS name');
      });
      const span = getSingleSpan();
      assertSpan(span);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'MATCH');
      assert.strictEqual(
        span.attributes[ATTR_DB_QUERY_TEXT],
        'MATCH (person:Person) RETURN person.name AS name'
      );
    });

    it('instruments session executeWrite/writeTransaction', async () => {
      // https://github.com/neo4j/neo4j-javascript-driver/wiki/6.x-changelog#-removals
      const version = require('neo4j-driver/package.json').version;
      const method = semverGt(version, '6.0.0')
        ? 'executeWrite'
        : 'writeTransaction';

      await driver.session()[method as 'executeWrite'](txc => {
        return txc.run('MATCH (person:Person) RETURN person.name AS name');
      });
      const span = getSingleSpan();
      assertSpan(span);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'MATCH');
      assert.strictEqual(
        span.attributes[ATTR_DB_QUERY_TEXT],
        'MATCH (person:Person) RETURN person.name AS name'
      );
    });

    it('instruments explicit transactions', async () => {
      const txc = driver.session().beginTransaction();
      await txc.run('MERGE (bob:Person {name: "Bob"}) RETURN bob.name AS name');
      await txc.run(
        'MERGE (adam:Person {name: "Adam"}) RETURN adam.name AS name'
      );
      await txc.commit();

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 2);
    });
  });

  describe('rxSession', () => {
    it('instruments "run"', done => {
      driver
        .rxSession()
        .run('MERGE (n:MyLabel) RETURN n')
        .records()
        .subscribe({
          complete: () => {
            const span = getSingleSpan();
            assertSpan(span);
            done();
          },
        });
    });

    it('works when piping response', done => {
      const rxSession = driver.rxSession();
      rxSession
        .run(
          'MERGE (james:Person {name: $nameParam}) RETURN james.name AS name',
          {
            nameParam: 'Bob',
          }
        )
        .records()
        .pipe(map(record => record.get('name')))
        .subscribe({
          next: () => {},
          complete: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.strictEqual(
              span.attributes[ATTR_DB_QUERY_TEXT],
              'MERGE (james:Person {name: $nameParam}) RETURN james.name AS name'
            );
            done();
          },
          error: () => {},
        });
    });

    it('works with response hook', done => {
      instrumentation.setConfig({
        responseHook: (span, response) => {
          span.setAttribute('db.response', normalizeResponse(response));
        },
      });

      driver
        .rxSession()
        .run('MERGE (n:MyLabel) RETURN n')
        .records()
        .subscribe({
          complete: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.strictEqual(
              span.attributes['db.response'],
              '[{"n":{"labels":["MyLabel"],"properties":{}}}]'
            );
            done();
          },
        });
    });
  });

  describe('reactive transaction', () => {
    it('instruments rx session executeRead/readTransaction', done => {
      // https://github.com/neo4j/neo4j-javascript-driver/wiki/6.x-changelog#-removals
      const version = require('neo4j-driver/package.json').version;
      const method = semverGt(version, '6.0.0')
        ? 'executeRead'
        : 'readTransaction';

      driver
        .rxSession() // eslint-disable-next-line no-unexpected-multiline -- Conflict with prettier
        [method as 'executeRead'](txc =>
          txc
            .run('MATCH (person:Person) RETURN person.name AS name')
            .records()
            .pipe(map(record => record.get('name')))
        )
        .subscribe({
          next: () => {},
          complete: () => {
            const span = getSingleSpan();
            assert.strictEqual(
              span.attributes[ATTR_DB_QUERY_TEXT],
              'MATCH (person:Person) RETURN person.name AS name'
            );
            done();
          },
          error: () => {},
        });
    });

    it('instruments rx session executeWrite/writeTransaction', done => {
      // https://github.com/neo4j/neo4j-javascript-driver/wiki/6.x-changelog#-removals
      const version = require('neo4j-driver/package.json').version;
      const method = semverGt(version, '6.0.0')
        ? 'executeWrite'
        : 'writeTransaction';

      driver
        .rxSession() // eslint-disable-next-line no-unexpected-multiline -- Conflict with prettier
        [method as 'executeWrite'](txc =>
          txc
            .run('MATCH (person:Person) RETURN person.name AS name')
            .records()
            .pipe(map(record => record.get('name')))
        )
        .subscribe({
          next: () => {},
          complete: () => {
            const span = getSingleSpan();
            assertSpan(span);
            assert.strictEqual(
              span.attributes[ATTR_DB_QUERY_TEXT],
              'MATCH (person:Person) RETURN person.name AS name'
            );
            done();
          },
          error: () => {},
        });
    });

    it('instruments rx explicit transactions', done => {
      driver
        .rxSession()
        .beginTransaction()
        .pipe(
          mergeMap(txc =>
            concat(
              txc
                .run(
                  'MERGE (bob:Person {name: $nameParam}) RETURN bob.name AS name',
                  {
                    nameParam: 'Bob',
                  }
                )
                .records()
                .pipe(map((r: any) => r.get('name'))),
              txc
                .run(
                  'MERGE (adam:Person {name: $nameParam}) RETURN adam.name AS name',
                  {
                    nameParam: 'Adam',
                  }
                )
                .records()
                .pipe(map((r: any) => r.get('name'))),
              txc.commit()
            )
          )
        )
        .subscribe({
          next: () => {},
          complete: () => {
            const spans = getTestSpans();
            assert.strictEqual(spans.length, 2);
            done();
          },
          error: () => {},
        });
    });
  });

  describe('routing mode', () => {
    // When the connection string starts with "neo4j" routing mode is used
    let routingDriver: Driver;
    const version = require('neo4j-driver/package.json').version;
    const shouldCheck = !['4.0.0', '4.0.1', '4.0.2'].includes(version);

    before(() => {
      if (shouldCheck) {
        routingDriver = neo4j.driver(
          `neo4j://${host}:${port}`,
          neo4j.auth.basic(user, password)
        );
      }
    });

    after(async () => {
      if (shouldCheck) {
        await routingDriver.close();
      }
    });

    it('instruments as expected in routing mode', async () => {
      if (!shouldCheck) {
        // Versions 4.0.0, 4.0.1 and 4.0.2 of neo4j-driver don't allow connection to local neo4j in routing mode.
        console.log(`Skipping unsupported test for version ${version}`);
        return;
      }

      await routingDriver.session().run('CREATE (n:MyLabel) RETURN n');

      const span = getSingleSpan();
      assertSpan(span);
    });
  });
});
