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

import * as graphql from 'graphql';

const books: Book[] = [];

interface Book {
  id: number;
  name: string;
  authorIds: number[];
}

function addBook(name: string, authorIds: number[] = []) {
  const id = books.length;
  books.push({ id, name, authorIds });
  return books[books.length - 1];
}

function prepareData() {
  addBook('First Book', [0, 1]);
  addBook('Second Book', [2]);
  addBook('Third Book', [3]);
}

prepareData();

export function buildTestSchema() {
  const Book = new graphql.GraphQLObjectType({
    name: 'Book',
    fields: {
      name: {
        type: graphql.GraphQLString,
        resolve(obj) {
          return obj.name;
        },
      },
    },
  });

  const query = new graphql.GraphQLObjectType({
    name: 'Query',
    fields: {
      books: {
        type: new graphql.GraphQLList(Book),
        resolve() {
          return Promise.resolve(books);
        },
      },
    },
  });

  const schema = new graphql.GraphQLSchema({ query });
  return schema;
}
