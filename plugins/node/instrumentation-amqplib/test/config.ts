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
export const TEST_RABBITMQ_HOST = 'localhost';
export const TEST_RABBITMQ_PORT = 22221;
export const TEST_RABBITMQ_USER = 'username';
export const TEST_RABBITMQ_PASS = 'password';
export const rabbitMqUrl = `amqp://${TEST_RABBITMQ_USER}:${TEST_RABBITMQ_PASS}@${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
export const censoredUrl = `amqp://${TEST_RABBITMQ_USER}:***@${TEST_RABBITMQ_HOST}:${TEST_RABBITMQ_PORT}`;
