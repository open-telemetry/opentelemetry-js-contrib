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
import * as assert from 'assert';
import * as testUtils from '@opentelemetry/contrib-test-utils';

describe('pg ESM usage', () => {
  const testPostgres = process.env.RUN_POSTGRES_TESTS; // For CI: assumes local postgres db is already available
  const testPostgresLocally = process.env.RUN_POSTGRES_TESTS_LOCAL; // For local: spins up local postgres db via docker
  const shouldTest = testPostgres || testPostgresLocally; // Skips these tests if false (default)

  before(function () {
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

    if (!shouldTest) {
      skip();
    }

    if (testPostgresLocally) {
      testUtils.startDocker('postgres');
    }
  });

  after(() => {
    if (testPostgresLocally) {
      testUtils.cleanUpDocker('postgres');
    }
  });

  it('should work with ESM usage', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-pg.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans.length, 3);

        assert.strictEqual(spans[0].name, 'pg.connect');
        assert.strictEqual(spans[0].kind, 3);
        assert.strictEqual(spans[1].name, 'test-span');
        assert.strictEqual(spans[1].kind, 1);
        assert.strictEqual(spans[2].name, 'pg.query:SELECT postgres');
        assert.strictEqual(spans[2].kind, 3);
      },
    });
  });
});
