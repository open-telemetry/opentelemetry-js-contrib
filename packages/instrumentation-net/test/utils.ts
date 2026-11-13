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
import {
  ATTR_TLS_CIPHER,
  ATTR_TLS_ESTABLISHED,
  ATTR_TLS_PROTOCOL_NAME,
  ATTR_TLS_PROTOCOL_VERSION,
  ATTR_TLS_SERVER_HASH_SHA1,
  ATTR_TLS_SERVER_HASH_SHA256,
  ATTR_TLS_SERVER_NOT_AFTER,
  ATTR_TLS_SERVER_NOT_BEFORE,
} from '../src/semconv';
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
  _socket: Socket,
  extraTLSAttributes: Attributes = {}
) {
  assertParentChild(tlsSpan, netSpan);
  assertSpanKind(netSpan);
  assertAttrib(netSpan, ATTR_NETWORK_TRANSPORT, NETWORK_TRANSPORT_VALUE_TCP);
  assertAttrib(netSpan, ATTR_SERVER_ADDRESS, HOST);
  assertAttrib(netSpan, ATTR_SERVER_PORT, PORT);
  assert.deepStrictEqual(tlsSpan.attributes, {
    [ATTR_TLS_ESTABLISHED]: true,
    [ATTR_TLS_PROTOCOL_NAME]: 'tls',
    [ATTR_TLS_PROTOCOL_VERSION]: '1.2',
    [ATTR_TLS_CIPHER]: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
    [ATTR_TLS_SERVER_HASH_SHA1]: '95DD2A8DCED2E7747C73C0832B46F888E88960C5',
    [ATTR_TLS_SERVER_HASH_SHA256]:
      'A14FDF58413B02E82824CC2B7C8ED54380F88A503B155B5E587D0D898FDC0C44',
    [ATTR_TLS_SERVER_NOT_BEFORE]: '2021-05-25T07:48:47.000Z',
    [ATTR_TLS_SERVER_NOT_AFTER]: '2121-05-01T07:48:47.000Z',
    ...extraTLSAttributes,
  });
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
