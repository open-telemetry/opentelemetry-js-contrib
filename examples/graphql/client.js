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

const url = require('url');
const http = require('http');
// Construct a schema, using GraphQL schema language

const source = `
query {
  books {
    name
    authors {
      name
      address {
        country
      }
    }
  }
}
`;

makeRequest(source).then(console.log);

function makeRequest(query) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL('http://localhost:4000/graphql');
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    const req = http.request(options, res => {
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        resolve(data.toString());
      });
      res.on('error', err => {
        reject(err);
      });
    });

    req.write(JSON.stringify({ query }));
    req.end();
  });
}
