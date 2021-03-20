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

import { SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as mongodb from 'mongodb';
import {
  DatabaseAttribute,
  GeneralAttribute,
} from '@opentelemetry/semantic-conventions';

export interface MongoDBAccess {
  client: mongodb.MongoClient;
  collection: mongodb.Collection;
}

/**
 * Access the mongodb collection.
 * @param url The mongodb URL to access.
 * @param dbName The mongodb database name.
 * @param collectionName The mongodb collection name.
 */
export function accessCollection(
  url: string,
  dbName: string,
  collectionName: string
): Promise<MongoDBAccess> {
  return new Promise((resolve, reject) => {
    mongodb.MongoClient.connect(url, (err, client) => {
      if (err) {
        reject(err);
        return;
      }
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      resolve({ client, collection });
    });
  });
}

/**
 * Asserts root spans attributes.
 * @param spans Readable spans that we need to assert.
 * @param expectedName The expected name of the first root span.
 * @param expectedKind The expected kind of the first root span.
 * @param log
 * @param isEnhancedDatabaseReportingEnabled Is enhanced database reporting enabled: boolean
 */
export function assertSpans(
  spans: ReadableSpan[],
  expectedName: string,
  expectedKind: SpanKind,
  log = false,
  isEnhancedDatabaseReportingEnabled = false
) {
  if (log) {
    console.log(spans);
  }
  assert.strictEqual(spans.length, 2);
  spans.forEach(span => {
    assert(span.endTime instanceof Array);
    assert(span.endTime.length === 2);
  });
  const [mongoSpan] = spans;
  assert.strictEqual(mongoSpan.name, expectedName);
  assert.strictEqual(mongoSpan.kind, expectedKind);
  assert.strictEqual(
    mongoSpan.attributes[DatabaseAttribute.DB_SYSTEM],
    'mongodb'
  );
  assert.strictEqual(
    mongoSpan.attributes[GeneralAttribute.NET_HOST_NAME],
    process.env.MONGODB_HOST || 'localhost'
  );
  assert.strictEqual(mongoSpan.status.code, SpanStatusCode.UNSET);

  if (isEnhancedDatabaseReportingEnabled) {
    const dbStatement = mongoSpan.attributes[
      DatabaseAttribute.DB_STATEMENT
    ] as any;
    for (const key in dbStatement) {
      assert.notStrictEqual(dbStatement[key], '?');
    }
  }
}
