/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export const TEST_RABBITMQ_HOST = 'localhost';
export const TEST_RABBITMQ_PORT = 22221;
export const TEST_RABBITMQ_USER = 'username';
export const TEST_RABBITMQ_PASS = 'password';
export const rabbitMqUrl = `amqp://${TEST_RABBITMQ_USER}:${TEST_RABBITMQ_PASS}@${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
export const censoredUrl = `amqp://${TEST_RABBITMQ_USER}:***@${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
