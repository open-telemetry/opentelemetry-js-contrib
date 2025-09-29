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

'use strict';

const { fetch } = require('cross-fetch');
const { print } = require('graphql');
const { wrapSchema, introspectSchema } = require('@graphql-tools/wrap');
const { transformSchemaFederation } = require('graphql-transform-federation');

const executor = async ({ document, variables }) => {
  const query = print(document);
  const fetchResult = await fetch('https://countries.trevorblades.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  return fetchResult.json();
};

module.exports = async () => {
  const schema = wrapSchema({
    schema: await introspectSchema(executor),
    executor,
  });

  return transformSchemaFederation(schema, {
    Query: {
      extend: true,
    },
  });
};
