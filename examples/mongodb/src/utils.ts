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

import * as mongodb from 'mongodb';

/**
 * Access the mongodb Db.
 * @param url The mongodb URL to access.
 * @param dbName The mongodb database name.
 * @param options The mongodb client config options.
 */
// eslint-disable-next-line import/prefer-default-export
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
