'use strict';

require('./tracer');

const { ApolloServer } = require('apollo-server');
const {
  ApolloGateway,
  RemoteGraphQLDataSource,
  LocalGraphQLDataSource,
} = require('@apollo/gateway');

const getCountriesSchema = require('./countries-service');

const setupGateway = async () => {
  const countriesSchema = await getCountriesSchema();

  const gateway = new ApolloGateway({
    serviceList: [{ name: 'countries', url: 'http://countries' }],

    // Experimental: Enabling this enables the query plan view in Playground.
    __exposeQueryPlanExperimental: false,

    buildService: ({ url }) => {
      if (url === 'http://countries') {
        return new LocalGraphQLDataSource(countriesSchema);
      }
      return new RemoteGraphQLDataSource({
        url,
      });
    },
  });

  return gateway;
};

(async () => {
  const gateway = await setupGateway();

  const server = new ApolloServer({
    gateway,

    // Apollo Graph Manager (previously known as Apollo Engine)
    // When enabled and an `ENGINE_API_KEY` is set in the environment,
    // provides metrics, schema management and trace reporting.
    engine: false,

    // Subscriptions are unsupported but planned for a future Gateway version.
    subscriptions: false,
  });

  server.listen().then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
})();
