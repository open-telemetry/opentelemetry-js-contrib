/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const axios = require('axios');
const { randomBytes } = require('crypto');
const { createClient } = require('redis');

const app = express();
const PORT = 8080;

/**
 * Redis Routes are set up async since we resolve the client once it is successfully connected
 */
async function setupRoutes() {
  const redisClient = await createClient({ url: 'redis://localhost:6379' })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  app.get('/run_test', async (req, res) => {
    const uuid = randomBytes(16).toString('hex');
    await axios.get(`http://localhost:${PORT}/set?args=uuid,${uuid}`);
    const body = await axios.get(`http://localhost:${PORT}/get?args=uuid`);

    if (body.data !== uuid) {
      throw new Error('UUID did not match!');
    } else {
      res.sendStatus(200);
    }
  });

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
