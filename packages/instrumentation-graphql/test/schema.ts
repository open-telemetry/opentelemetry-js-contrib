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

import * as https from 'https';
import * as graphql from 'graphql';

const url1 =
  'https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/package.json';

function getData(url: string): any {
  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(JSON.parse(data));
        });
      })
      .on('error', err => {
        reject(err);
      });
  });
}

interface Book {
  __typename: 'Book';
  id: number;
  name: string;
  authorIds: number[];
}

interface EBook {
  __typename: 'EBook';
  id: number;
  name: string;
  authorIds: number[];
}

interface Address {
  __typename: 'Address';
  country: string;
  city: string;
}

interface Author {
  __typename: 'Author';
  id: number;
  name: string;
  address: Address;
}

const books: Book[] = [];
const ebooks: EBook[] = [];
const authors: Author[] = [];

function addBook(name: string, authorIds: number[] = []) {
  const id = books.length;
  books.push({
    __typename: 'Book',
    id: id,
    name: name,
    authorIds: authorIds,
  });
  return books[books.length - 1];
}

function addEBook(name: string, authorIds: number[] = []) {
  const id = books.length;
  ebooks.push({
    __typename: 'EBook',
    id: id,
    name: name,
    authorIds: authorIds,
  });
  return ebooks[ebooks.length - 1];
}

function addAuthor(name: string, country: string, city: string) {
  const id = authors.length;
  authors.push({
    __typename: 'Author',
    id,
    name,
    address: { __typename: 'Address', country, city },
  });
  return authors[authors.length - 1];
}

function getBook(id: number) {
  return books[id];
}

function getAuthor(id: number) {
  return authors[id];
}

function prepareData() {
  addAuthor('John', 'Poland', 'Szczecin');
  addAuthor('Alice', 'Poland', 'Warsaw');
  addAuthor('Bob', 'England', 'London');
  addAuthor('Christine', 'France', 'Paris');
  addBook('First Book', [0, 1]);
  addBook('Second Book', [2]);
  addBook('Third Book', [3]);
  addEBook('First EBook', [1, 3]);
}

prepareData();

export function buildTestSchema() {
  const Address = new graphql.GraphQLObjectType({
    name: 'Address',
    fields: {
      country: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.country;
        },
      },
      city: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.city;
        },
      },
    },
  });

  const Author = new graphql.GraphQLObjectType({
    name: 'Author',
    fields: {
      id: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.id;
        },
      },
      name: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.name;
        },
      },
      description: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return new Promise((resolve, reject) => {
            getData(url1).then((response: { [key: string]: string }) => {
              resolve(response.description);
            }, reject);
          });
        },
      },
      address: {
        type: Address,
        resolve(obj, args) {
          return obj.address;
        },
      },
    },
  });

  const Book = new graphql.GraphQLObjectType({
    name: 'Book',
    fields: {
      id: {
        type: graphql.GraphQLInt,
        resolve(obj, args) {
          return obj.id;
        },
      },
      name: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.name;
        },
      },
      authors: {
        type: new graphql.GraphQLList(Author),
        resolve(obj, args) {
          return obj.authorIds.map((id: number) => {
            return authors[id];
          });
        },
      },
    },
  });

  // DO NOT RE-USE THIS TYPE DIRECTLY
  // To truly test union type support, we need a type with sub-resolvers that is only found under a union type.
  // This type is currently used only under the 'SearchResult' union type.
  const EBook = new graphql.GraphQLObjectType({
    name: 'EBook',
    fields: {
      id: {
        type: graphql.GraphQLInt,
        resolve(obj, args) {
          return obj.id;
        },
      },
      name: {
        type: graphql.GraphQLString,
        resolve(obj, args) {
          return obj.name;
        },
      },
      authors: {
        type: new graphql.GraphQLList(Author),
        resolve(obj, args) {
          return obj.authorIds.map((id: number) => {
            return authors[id];
          });
        },
      },
    },
  });

  const searchResult = new graphql.GraphQLUnionType({
    name: 'SearchResult',
    types: [Book, EBook],
  });

  const query = new graphql.GraphQLObjectType({
    name: 'Query',
    fields: {
      author: {
        type: Author,
        args: {
          id: { type: graphql.GraphQLInt },
        },
        resolve(obj, args, context) {
          return Promise.resolve(getAuthor(args.id));
        },
      },
      authors: {
        type: new graphql.GraphQLList(Author),
        resolve(obj, args, context) {
          return Promise.resolve(authors);
        },
      },
      book: {
        type: Book,
        args: {
          id: { type: graphql.GraphQLInt },
        },
        resolve(obj, args, context) {
          return Promise.resolve(getBook(args.id));
        },
      },
      books: {
        type: new graphql.GraphQLList(Book),
        resolve(obj, args, context) {
          return Promise.resolve(books);
        },
      },
      search: {
        type: new graphql.GraphQLList(searchResult),
        args: {
          name: { type: new graphql.GraphQLNonNull(graphql.GraphQLString) },
        },
        resolve(obj, args, context) {
          const searchName = args.name.toLowerCase();
          const results = [...books, ...ebooks].filter(item =>
            item.name.toLowerCase().includes(searchName)
          );
          return Promise.resolve(results);
        },
      },
    },
  });

  const mutation = new graphql.GraphQLObjectType({
    name: 'Mutation',
    fields: {
      addBook: {
        type: Book,
        args: {
          name: { type: new graphql.GraphQLNonNull(graphql.GraphQLString) },
          authorIds: {
            type: new graphql.GraphQLNonNull(graphql.GraphQLString),
          },
        },
        resolve(obj, args, context) {
          return Promise.resolve(addBook(args.name, args.authorIds));
        },
      },
    },
  });

  const schema = new graphql.GraphQLSchema({ query, mutation });
  return schema;
}
