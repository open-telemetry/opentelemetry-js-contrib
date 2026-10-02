/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests';
export const MONGO_HOST = process.env.MONGODB_HOST || 'localhost';
export const MONGO_PORT = Number(process.env.MONGODB_PORT || 27017);

export const MONGO_URI = `mongodb://${MONGO_HOST}/${MONGO_PORT}`;
