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
export const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests';
export const MONGO_HOST = process.env.MONGODB_HOST || 'localhost';
export const MONGO_PORT = Number(process.env.MONGODB_PORT || 27017);

export const MONGO_URI = `mongodb://${MONGO_HOST}/${MONGO_PORT}`;

export const shouldTest = process.env.RUN_MONGODB_TESTS != null;
if (!shouldTest) {
  console.log(
    'Skipping mongodb tests. Set RUN_MONGODB_TESTS=true to run them.'
  );
}
