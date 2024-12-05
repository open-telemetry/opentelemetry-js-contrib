import * as assert from 'assert';
import * as testUtils from '@opentelemetry/contrib-test-utils';

describe('pg ESM usage', () => {
  const testPostgres = process.env.RUN_POSTGRES_TESTS; // For CI: assumes local postgres db is already available
  const testPostgresLocally = process.env.RUN_POSTGRES_TESTS_LOCAL; // For local: spins up local postgres db via docker
  const shouldTest = testPostgres || testPostgresLocally; // Skips these tests if false (default)

  before(async function () {
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

  after(async () => {
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
      checkResult: (err) => {
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
