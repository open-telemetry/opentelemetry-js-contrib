/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
import {
  ATTR_NETWORK_LOCAL_ADDRESS,
  ATTR_NETWORK_LOCAL_PORT,
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_TRANSPORT,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  NETWORK_TRANSPORT_VALUE_TCP,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { Socket } from 'net';
import { STABLE_IPC_TRANSPORT_VALUE } from '../src/utils';
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

  const attributes: Attributes = {};
  attributes[ATTR_NETWORK_TRANSPORT] = NETWORK_TRANSPORT_VALUE_TCP;
  attributes[ATTR_SERVER_ADDRESS] = HOST;
  attributes[ATTR_SERVER_PORT] = PORT;
  attributes[ATTR_NETWORK_PEER_ADDRESS] = socket.remoteAddress;
  attributes[ATTR_NETWORK_LOCAL_ADDRESS] = socket.localAddress;
  attributes[ATTR_NETWORK_LOCAL_PORT] = socket.localPort;

  assert.deepEqual(span.attributes, attributes);
}

export function assertIpcSpan(span: ReadableSpan) {
  assertSpanKind(span);
  const attributes: Attributes = {};
  attributes[ATTR_NETWORK_TRANSPORT] = STABLE_IPC_TRANSPORT_VALUE;
  attributes[ATTR_SERVER_ADDRESS] = IPC_PATH;
  assert.deepEqual(span.attributes, attributes);
}

export function assertTLSSpan(
  { netSpan, tlsSpan }: { netSpan: ReadableSpan; tlsSpan: ReadableSpan },
  _socket: Socket
) {
  assertParentChild(tlsSpan, netSpan);
  assertSpanKind(netSpan);
  assertAttrib(netSpan, ATTR_NETWORK_TRANSPORT, NETWORK_TRANSPORT_VALUE_TCP);
  assertAttrib(netSpan, ATTR_SERVER_ADDRESS, HOST);
  assertAttrib(netSpan, ATTR_SERVER_PORT, PORT);
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

export function assertParentChild(
  parentSpan: ReadableSpan,
  childSpan: ReadableSpan
) {
  assert.strictEqual(
    childSpan.spanContext().traceId,
    parentSpan.spanContext().traceId
  );
  assert.strictEqual(
    childSpan.parentSpanContext?.spanId,
    parentSpan.spanContext().spanId
  );
}

export const TLS_SERVER_CERT = fs
  .readFileSync(path.resolve(__dirname, './fixtures/tls.crt'))
  .toString();

export const TLS_SERVER_KEY = fs
  .readFileSync(path.resolve(__dirname, './fixtures/tls.key'))
  .toString();
