/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const { createClient } = require('redis');

const PORT = 8080;
const app = express();

// Setup routes *asynchronously* to allow Redis client to connect first.
async function setupRoutes() {
  const redisClient = await createClient({ url: 'redis://localhost:6379' })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  /**
   * Expose a basic HTTP interface to Redis commands.
   *
   * Note: This is for demonstration purposes. Do not use this server as a
   * good example of security practices.
   */
  app.get('/:cmd', async (req, res) => {
    if (!req.query.args) {
      res.status(400).send('No args provided');
      return;
    }

    const { cmd } = req.params;
    const args = req.query.args.split(',');

    const result = await redisClient[cmd](...args);
    res.status(200).send(result);
  });
}

setupRoutes()
  .then(() => {
    app.listen(PORT);
    console.log(`Listening on http://localhost:${PORT}`);
  })
  .catch(err => console.log(err));
