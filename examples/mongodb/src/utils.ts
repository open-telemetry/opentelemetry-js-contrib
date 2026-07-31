/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as mongodb from 'mongodb';

/**
 * Access the mongodb Db.
 * @param url The mongodb URL to access.
 * @param dbName The mongodb database name.
 * @param options The mongodb client config options.
 */
export function accessDB(
  url: string,
  dbName: string,
  options: mongodb.MongoClientOptions = {}
): Promise<mongodb.Db> {
  return new Promise((resolve, reject) => {
    mongodb.MongoClient.connect(url, {
      serverSelectionTimeoutMS: 1000,
    })
      .then(client => {
        resolve(client.db(dbName));
      })
      .catch(reason => {
        reject(reason);
      });
  });
}
