/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from 'redis';

const client = createClient('redis://localhost:6379');
export const redisPromise = new Promise((resolve, reject) => {
  client.once('ready', () => {
    resolve(client);
  });
  client.once('error', error => {
    reject(error);
  });
});
