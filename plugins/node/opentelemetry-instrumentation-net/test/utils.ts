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
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  NetTransportValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { Socket } from 'net';
import { IPC_TRANSPORT } from '../src/utils';
import { TLSAttributes } from '../src/types';
import * as fs from 'fs';

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

export function assertTLSSpan(
  { netSpan, tlsSpan }: { netSpan: ReadableSpan; tlsSpan: ReadableSpan },
  socket: Socket
) {
  assertSpanKind(netSpan);
  assertAttrib(
    netSpan,
    SemanticAttributes.NET_TRANSPORT,
    NetTransportValues.IP_TCP
  );
  assertAttrib(netSpan, SemanticAttributes.NET_PEER_NAME, HOST);
  assertAttrib(netSpan, SemanticAttributes.NET_PEER_PORT, PORT);
  // Node.JS 10 sets socket.localAddress & socket.localPort to "undefined" when a connection is
  // ended, so one of the tests fails, so we skip them for TLS
  // assertAttrib(span, SemanticAttributes.NET_HOST_IP, socket.localAddress);
  //assertAttrib(netSpan, SemanticAttributes.NET_HOST_PORT, socket.localPort);

  assertAttrib(tlsSpan, TLSAttributes.PROTOCOL, 'TLSv1.2');
  assertAttrib(tlsSpan, TLSAttributes.AUTHORIZED, 'true');
  assertAttrib(
    tlsSpan,
    TLSAttributes.CIPHER_NAME,
    'ECDHE-RSA-AES128-GCM-SHA256'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_FINGERPRINT,
    '95:DD:2A:8D:CE:D2:E7:74:7C:73:C0:83:2B:46:F8:88:E8:89:60:C5'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_SERIAL_NUMBER,
    '3EB107D024F9E3646B9236E3E3CB147BD6351AD9'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_VALID_FROM,
    'May 25 07:48:47 2021 GMT'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_VALID_TO,
    'May  1 07:48:47 2121 GMT'
  );
}

export function assertSpanKind(span: ReadableSpan) {
  assert.strictEqual(span.kind, SpanKind.INTERNAL);
}

export function assertAttrib(span: ReadableSpan, attrib: string, value: any) {
  assert.strictEqual(span.attributes[attrib], value);
}

export const TLS_SERVER_CERT = fs
  .readFileSync(path.resolve(__dirname, './fixtures/tls.crt'))
  .toString();

export const TLS_SERVER_KEY = fs
  .readFileSync(path.resolve(__dirname, './fixtures/tls.key'))
  .toString();
