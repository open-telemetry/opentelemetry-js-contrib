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
import { strict as assert } from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';

import { ATTR_MESSAGING_SYSTEM } from '../src/semconv';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';

import expect from 'expect';
import { Server } from 'socket.io';
import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';
import * as path from 'path';

export const io = ioClient.io || ioClient;

const packageJsonPath = (packageName: string) =>
  path.join(path.dirname(require.resolve(packageName)), '..', 'package.json');
const version = require(packageJsonPath('socket.io')).version;

assert.equal(typeof version, 'string');

export const isV2 = version && /^2\./.test(version);

export const createServer = (
  callback: (server: Server, port: number) => void
) => {
  const server = http.createServer();
  const sio = createServerInstance(server);
  server.listen(0, () => {
    const port = (server.address() as AddressInfo).port;
    callback(sio, port);
  });
};

export const createServerInstance = (server?: http.Server) => {
  if (isV2) {
    return (socketIo as any)(server, { serveClient: false });
  }
  return new Server(server);
};

export const getSocketIoSpans = (): ReadableSpan[] =>
  getTestSpans().filter(
    s => s.attributes[ATTR_MESSAGING_SYSTEM] === 'socket.io'
  ) as ReadableSpan[];

export const expectSpan = (
  spanName: string,
  callback?: (span: ReadableSpan) => void,
  spanCount?: number
) => {
  const spans = getSocketIoSpans();
  expect(spans.length).toEqual(spanCount || 1);
  const span = spans.find(s => s.name === spanName);
  expect(span).toBeDefined();
  if (span && callback) {
    callback(span);
  }
};

export const expectSpans = (
  spanNames: string,
  callback?: (spans: ReadableSpan[]) => void,
  spanCount?: number
) => {
  const spans = getSocketIoSpans();
  expect(spans.length).toEqual(spanCount || 1);
  const foundSpans = spans.filter(span => spanNames.includes(span.name));
  expect(foundSpans).toBeDefined();
  callback?.(foundSpans);
};
