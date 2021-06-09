'use strict';

require('./tracer');

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const buildSchema = require('./schema');
const otel = require('@opentelemetry/api');

const schema = buildSchema();

const testMw = function (req, res, next) {
  otel.context.with(
    otel.propagation.setBaggage(
      otel.context.active(),
      otel.propagation.createBaggage({
        'test': { value: 'testValue' },
      })
    ),
    () => {
      console.log('attached baggage', otel.propagation.getBaggage(otel.context.active()));
      next();
    }
  );
}

const printMw = function (req, res, next) {
  console.log('printMw baggage', otel.propagation.getBaggage(otel.context.active()));
  next();
}

const app = express();
app.use(testMw);
app.use(printMw);
app.use('/graphql', graphqlHTTP({
  schema,
  graphiql: true,
}));

app.listen(4000);

console.log('Running a GraphQL API server at http://localhost:4000/graphql');
