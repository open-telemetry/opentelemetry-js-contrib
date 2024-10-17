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
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_NET_PEER_NAME,
} from '@opentelemetry/semantic-conventions';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { strictEqual, notStrictEqual } from 'assert';
import type { MongoClient, MongoClientOptions, Collection } from 'mongodb';
import assert = require('assert');

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

/**
 * Asserts root spans attributes.
 * @param spans Readable spans that we need to
 * @param expectedName The expected name of the first root span.
 * @param expectedKind The expected kind of the first root span.
 * @param log Whether should debug print the expected spans.
 * @param isEnhancedDatabaseReportingEnabled Is enhanced database reporting enabled: boolean.
 */
export function assertSpans(
  spans: ReadableSpan[],
  expectedName: string,
  expectedKind: SpanKind,
  expectedOperation: string,
  expectedConnString: string | undefined,
  log = false,
  isEnhancedDatabaseReportingEnabled = false
) {
  if (log) {
    console.log(spans);
  }
  strictEqual(spans.length, 2);
  spans.forEach(span => {
    assert(span.endTime instanceof Array);
    assert(span.endTime.length === 2);
  });
  const [mongoSpan] = spans;
  strictEqual(mongoSpan.name, expectedName);
  strictEqual(mongoSpan.kind, expectedKind);
  strictEqual(mongoSpan.attributes[SEMATTRS_DB_OPERATION], expectedOperation);
  strictEqual(mongoSpan.attributes[SEMATTRS_DB_SYSTEM], 'mongodb');
  strictEqual(
    mongoSpan.attributes[SEMATTRS_NET_PEER_NAME],
    process.env.MONGODB_HOST || DEFAULT_MONGO_HOST
  );
  strictEqual(mongoSpan.status.code, SpanStatusCode.UNSET);
  if (expectedConnString) {
    strictEqual(
      mongoSpan.attributes[SEMATTRS_DB_CONNECTION_STRING],
      expectedConnString
    );
  }

  if (isEnhancedDatabaseReportingEnabled) {
    const dbStatement = JSON.parse(
      mongoSpan.attributes[SEMATTRS_DB_STATEMENT] as string
    );
    for (const key in dbStatement) {
      notStrictEqual(dbStatement[key], '?');
    }
  }
}
