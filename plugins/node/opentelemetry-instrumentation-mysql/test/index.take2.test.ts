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

// const port = Number(process.env.MYSQL_PORT) || 33306;
// const database = process.env.MYSQL_DATABASE || 'test_db';
// const host = process.env.MYSQL_HOST || '127.0.0.1';
// const user = process.env.MYSQL_USER || 'otel';
// const password = process.env.MYSQL_PASSWORD || 'secret';

// const inMemoryMetricsExporter = new InMemoryMetricExporter(
//   AggregationTemporality.CUMULATIVE
// );

// const instrumentation = new MySQLInstrumentation();
// instrumentation.enable();
// instrumentation.disable();

// async function waitForNumberOfExports(
//   exporter: InMemoryMetricExporter,
//   numberOfExports: number
// ): Promise<ResourceMetrics[]> {
//   if (numberOfExports <= 0) {
//     throw new Error('numberOfExports must be greater than or equal to 0');
//   }
//   let totalExports = 0;
//   while (totalExports < numberOfExports) {
//     await new Promise(resolve => setTimeout(resolve, 20));
//     const exportedMetrics = exporter.getMetrics();
//     totalExports = exportedMetrics.length;
//   }
//   return exporter.getMetrics();
// }

// import * as mysqlTypes from 'mysql';

// describe('mysql@2.x-MetricsTake2', () => {
//   let contextManager: AsyncHooksContextManager;
//   let connection: mysqlTypes.Connection;
//   let pool: mysqlTypes.Pool;
//   const provider = new BasicTracerProvider();
//   const testMysql = process.env.RUN_MYSQL_TESTS; // For CI: assumes local mysql db is already available
//   const testMysqlLocally = process.env.RUN_MYSQL_TESTS_LOCAL; // For local: spins up local mysql db via docker
//   const shouldTest = testMysql || testMysqlLocally; // Skips these tests if false (default)
//   const memoryExporter = new InMemorySpanExporter();

//   before(function (done) {
//     if (!shouldTest) {
//       // this.skip() workaround
//       // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
//       this.test!.parent!.pending = true;
//       this.skip();
//     }
//     if (testMysqlLocally) {
//       testUtils.startDocker('mysql');
//       // wait 15 seconds for docker container to start
//       this.timeout(20000);
//       setTimeout(done, 15000);
//     } else {
//       done();
//     }
//   });

//   after(function () {
//     if (testMysqlLocally) {
//       this.timeout(5000);
//       testUtils.cleanUpDocker('mysql');
//     }
//   });

//   beforeEach(() => {
//     instrumentation.disable();
//     contextManager = new AsyncHooksContextManager().enable();
//     context.setGlobalContextManager(contextManager);
//     instrumentation.setTracerProvider(provider);
//     instrumentation.enable();
//     connection = mysqlTypes.createConnection({
//       port,
//       user,
//       host,
//       password,
//       database,
//     });
//     pool = mysqlTypes.createPool({
//       port,
//       user,
//       host,
//       password,
//       database,
//     });
//   });

//   afterEach(done => {
//     context.disable();
//     memoryExporter.reset();
//     instrumentation.disable();
//     connection.end(() => {
//       pool.end(() => {
//         done();
//       });
//     });
//   });

//   describe('#Pool-MetricsTake2', () => {
//     it('Metrics-Should add connection usage metrics', done => {
//       pool.getConnection(
//         (connErr: mysqlTypes.MysqlError, conn: mysqlTypes.PoolConnection) => {
//           assert.ifError(connErr);
//           assert.ok(conn);
//           const sql = 'SELECT 1+1 as solution';
//           conn.query(sql, async (err, results) => {
//             assert.ifError(err);
//             assert.ok(results);
//             conn.release();

//             assert.strictEqual(results[0]?.solution, 2);
//             let exportedMetrics = await waitForNumberOfExports(
//               inMemoryMetricsExporter,
//               1
//             );
//             assert.strictEqual(exportedMetrics.length, 1); //originaly was '1'
//             const metrics = exportedMetrics[0].scopeMetrics[0].metrics;
//             assert.strictEqual(metrics.length, 1);
//             assert.strictEqual(metrics[0].dataPointType, DataPointType.SUM);

//             assert.strictEqual(
//               metrics[0].descriptor.description,
//               'The number of connections that are currently in state described by the state attribute.'
//             );
//             assert.strictEqual(metrics[0].descriptor.unit, '{connections}');
//             assert.strictEqual(
//               metrics[0].descriptor.name,
//               'db.client.connections.usage'
//             );
//             // assert.strictEqual(metrics[0].dataPoints.length, 2);
//             // assert.strictEqual(metrics[0].dataPoints[0].value, 0);
//             // assert.strictEqual(
//             //   metrics[0].dataPoints[0].attributes['db.client.connection.usage.state'],
//             //   'idle'
//             // );
//             // assert.strictEqual(metrics[0].dataPoints[1].value, 1);
//             // assert.strictEqual(
//             //   metrics[0].dataPoints[1].attributes['db.client.connection.usage.state'],
//             //   'used'
//             // );

//             exportedMetrics = await waitForNumberOfExports(
//               inMemoryMetricsExporter,
//               1
//             );
//             // assert.strictEqual(exportedMetrics.length, 2);
//             done();
//           });
//         }
//       );
//     });
//   });
// });
