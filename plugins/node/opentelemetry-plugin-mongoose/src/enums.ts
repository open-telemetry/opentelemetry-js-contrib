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
export enum AttributeNames {
  COMPONENT = 'component',
  DB_TYPE = 'db.type',
  DB_NAME = 'db.name',
  DB_HOST = 'db.host',
  DB_PORT = 'db.port',
  DB_USER = 'db.user',
  COLLECTION_NAME = 'db.collection',
  DB_STATEMENT = 'db.statement',
  DB_OPTIONS = 'db.options',
  DB_UPDATE = 'db.updates',
  DB_SAVE = 'db.save',
  DB_RESPONSE = 'db.response',
  MONGO_ERROR_CODE = 'db.error_code',
  DB_MODEL = 'db.doc',
  DB_MODEL_NAME = 'mongoose.model',
  DB_QUERY_TYPE = 'mongoose.query',
  DB_AGGREGATE_PIPELINE = 'mongoose.db.aggregate_pipeline',
}
