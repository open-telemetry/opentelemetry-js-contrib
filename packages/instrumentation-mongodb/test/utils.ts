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

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_OPERATION,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
} from '../src/semconv';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import type { MongoClient, MongoClientOptions, Collection } from 'mongodb';
import { SemconvStability } from '@opentelemetry/instrumentation';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
} from '@opentelemetry/semantic-conventions';

export const DEFAULT_MONGO_HOST = '127.0.0.1';

export interface MongoDBAccess {
  client: MongoClient;
  collection: Collection;
}

/**
 * Access the mongodb collection.
 * @param url The mongodb URL to access.
 * @param dbName The mongodb database name.
 * @param collectionName The mongodb collection name.
 * @param options The mongodb client config options.
 */
export function accessCollection(
  url: string,
  dbName: string,
  collectionName: string,
  options: MongoClientOptions = {}
): Promise<MongoDBAccess> {
  return new Promise((resolve, reject) => {
    let mongodb;
    try {
      mongodb = require('mongodb');
    } catch (err: any) {
      reject(new Error('Could not load mongodb. ' + err.message));
      return;
    }
    mongodb.MongoClient.connect(url, {
      serverSelectionTimeoutMS: 1000,
    })
      .then((client: MongoClient) => {
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        resolve({ client, collection });
      })
      .catch((reason: any) => {
        reject(
          new Error('Could not connect. Run MongoDB to test. ' + reason.message)
        );
      });
  });
}

export function assertSpans(
  spans: ReadableSpan[],
  semconvStability: SemconvStability,
  expectedOperation: string,
  expectedCollection: string,
  expectedConnString: string | undefined,
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
  assert.strictEqual(mongoSpan.kind, SpanKind.CLIENT);
  assert.strictEqual(mongoSpan.status.code, SpanStatusCode.UNSET);

  if (semconvStability & SemconvStability.STABLE) {
    assert.strictEqual(
      mongoSpan.name,
      `${expectedOperation} ${expectedCollection}`
    );
  } else {
    assert.strictEqual(mongoSpan.name, `mongodb.${expectedOperation}`);
  }

  if (semconvStability & SemconvStability.OLD) {
    assert.strictEqual(
      mongoSpan.attributes[ATTR_DB_OPERATION],
      expectedOperation
    );
    assert.strictEqual(
      mongoSpan.attributes[ATTR_DB_MONGODB_COLLECTION],
      expectedCollection
    );
    assert.strictEqual(mongoSpan.attributes[ATTR_DB_SYSTEM], 'mongodb');
    assert.strictEqual(
      mongoSpan.attributes[ATTR_NET_PEER_NAME],
      process.env.MONGODB_HOST || DEFAULT_MONGO_HOST
    );
    if (expectedConnString) {
      assert.strictEqual(
        mongoSpan.attributes[ATTR_DB_CONNECTION_STRING],
        expectedConnString
      );
    }
  } else {
    assert.strictEqual(mongoSpan.attributes[ATTR_DB_SYSTEM], undefined);
  }

  if (semconvStability & SemconvStability.STABLE) {
    assert.strictEqual(
      mongoSpan.attributes[ATTR_DB_OPERATION_NAME],
      expectedOperation
    );
    assert.strictEqual(
      mongoSpan.attributes[ATTR_DB_COLLECTION_NAME],
      expectedCollection
    );
    assert.strictEqual(mongoSpan.attributes[ATTR_DB_SYSTEM_NAME], 'mongodb');
    assert.strictEqual(
      mongoSpan.attributes[ATTR_SERVER_ADDRESS],
      process.env.MONGODB_HOST || DEFAULT_MONGO_HOST
    );
  } else {
    assert.strictEqual(mongoSpan.attributes[ATTR_DB_SYSTEM_NAME], undefined);
  }

  if (isEnhancedDatabaseReportingEnabled) {
    const dbQueryText =
      mongoSpan.attributes[ATTR_DB_QUERY_TEXT] ||
      mongoSpan.attributes[ATTR_DB_STATEMENT];
    const dbStatement = JSON.parse(dbQueryText as string);
    for (const key in dbStatement) {
      assert.notStrictEqual(dbStatement[key], '?');
    }
  }
}
