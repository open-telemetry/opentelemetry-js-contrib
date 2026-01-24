'use strict';

import {createClient} from 'redis';

const client = createClient('redis://localhost:6379');
const redisPromise = new Promise(((resolve, reject) => {
  client.once('ready', () => {
    resolve(client);
  });
  client.once('error', (error) => {
    reject(error);
  });
}));

exports.redis = redisPromise;
