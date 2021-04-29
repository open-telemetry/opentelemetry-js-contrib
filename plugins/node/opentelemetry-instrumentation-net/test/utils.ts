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

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/tracing';
import {
  NetTransportValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { Socket } from 'net';
import { IPC_TRANSPORT } from '../src/utils';

export const PORT = 42123;
export const HOST = 'localhost';
export const IPC_PATH =
  os.platform() !== 'win32'
    ? path.join(os.tmpdir(), 'otel-js-net-test-ipc')
    : '\\\\.\\pipe\\otel-js-net-test-ipc';

export function assertTcpSpan(span: ReadableSpan, socket: Socket) {
  assertSpanKind(span);
  assertAttrib(
    span,
    SemanticAttributes.NET_TRANSPORT,
    NetTransportValues.IP_TCP
  );
  assertAttrib(span, SemanticAttributes.NET_PEER_NAME, HOST);
  assertAttrib(span, SemanticAttributes.NET_PEER_PORT, PORT);
  assertAttrib(span, SemanticAttributes.NET_HOST_IP, socket.localAddress);
  assertAttrib(span, SemanticAttributes.NET_HOST_PORT, socket.localPort);
}

export function assertIpcSpan(span: ReadableSpan) {
  assertSpanKind(span);
  assertAttrib(span, SemanticAttributes.NET_TRANSPORT, IPC_TRANSPORT);
  assertAttrib(span, SemanticAttributes.NET_PEER_NAME, IPC_PATH);
}

export function assertSpanKind(span: ReadableSpan) {
  assert.strictEqual(span.kind, SpanKind.INTERNAL);
}

export function assertAttrib(span: ReadableSpan, attrib: string, value: any) {
  assert.strictEqual(span.attributes[attrib], value);
}
