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
import { TLSAttributes } from '../src/types';

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
    '60:58:0C:4B:52:20:2A:53:4F:50:93:3A:2F:F7:72:06:DD:B3:30:DC'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_SERIAL_NUMBER,
    'D789EA9C1A7887D5'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_VALID_FROM,
    'Apr 22 12:27:31 2021 GMT'
  );
  assertAttrib(
    tlsSpan,
    TLSAttributes.CERTIFICATE_VALID_TO,
    'May 22 12:27:31 2021 GMT'
  );
}

export function assertSpanKind(span: ReadableSpan) {
  assert.strictEqual(span.kind, SpanKind.INTERNAL);
}

export function assertAttrib(span: ReadableSpan, attrib: string, value: any) {
  assert.strictEqual(span.attributes[attrib], value);
}

export const TLS_SERVER_CERT = `-----BEGIN CERTIFICATE-----
MIIFrjCCA5YCCQDXieqcGniH1TANBgkqhkiG9w0BAQUFADCBmDELMAkGA1UEBhMC
RVgxEDAOBgNVBAgMB0V4YW1wbGUxFTATBgNVBAcMDEV4YW1wbGUgQ2l0eTEWMBQG
A1UECgwNT3BlblRlbGVtZXRyeTETMBEGA1UECwwKSlMgQ29udHJpYjESMBAGA1UE
AwwJbG9jYWxob3N0MR8wHQYJKoZIhvcNAQkBFhB0ZXN0QGV4YW1wbGUuY29tMB4X
DTIxMDQyMjEyMjczMVoXDTIxMDUyMjEyMjczMVowgZgxCzAJBgNVBAYTAkVYMRAw
DgYDVQQIDAdFeGFtcGxlMRUwEwYDVQQHDAxFeGFtcGxlIENpdHkxFjAUBgNVBAoM
DU9wZW5UZWxlbWV0cnkxEzARBgNVBAsMCkpTIENvbnRyaWIxEjAQBgNVBAMMCWxv
Y2FsaG9zdDEfMB0GCSqGSIb3DQEJARYQdGVzdEBleGFtcGxlLmNvbTCCAiIwDQYJ
KoZIhvcNAQEBBQADggIPADCCAgoCggIBAO4Kz5+KCwKQg7eojoyzeTzdI52aWN5b
EySHB36+hXatVEBf1a/01CIKxmZPalRJj6PojDyLNGzf6ueVQIJ2B8A7G4I7eDqK
juqhYbaJpUm2Il9RI6QH5IhNMaVabOOppYX5FNHOh6x7MUVQ0JstH/lNr8NzyDpk
fZJGbWzPFmYOstiUz3Zk+G7XJAT+HDBWOWiTdcslsXsl0giYzbZ0V3+ofA0V/Sp3
UDbFSxAWdQ0fxia1fCGubYheZP6w8rAIz8roc8kDvlvgWowuqltGSLLoCeei/3xe
ZB8LFl37vE38niOMxIcnUS5ddnGgO4jvlOb6iGe31RNBbVU4NhRKOEOKwy+GQfxu
ZRH4nfzdO984OPpj/LHBbgDCMken6KxmPPznZ8K1jmT8PlSC04Kc5z/bb7E5mJyF
ixglq6CLxT2n7pDSILKsK74dE0fhQhnJ3bjT2U3ZISYox1JZmT5krmdpNk7xpICn
0GdobbXObWAqaTqRmMwBZXoV2d9UP/UJUr0OFsZbf4xuW8O+KVdrx4T0ZiQgHyZM
gAxzC0I6yJQlBG7Q3T9FnVkNaUGJmjI2PT9v91VRmER3DzftB3n5jg+yWJU4G76A
6OdZGjQhUIjiP6KmnaaMheHKo+SNRxH4T/ZDIsebn0LLurBQ46Z9DNnoep5iiRC5
xFK/bqUl0jd9AgMBAAEwDQYJKoZIhvcNAQEFBQADggIBADc0D7rxXeuqUX27K51i
yQ/0COhEFQW4NcjThLiMt8QDRidqfIhZwdx/KXf/6zwycCizZE9FKVXXphcR/9xn
nJ6VlZSYXg4MG/Zkm2LpH0zNL44DXjV/VoHDaQuksXqxQkYoAKY8q8w2lpVRcvEG
726FzsZEPIzU/p0LUkKf4EixaoaFHCSLn2Ee7ArHF4T9nuSEnxFTao99zo8zQdwz
Suye5FLiHtgAK7J17uACB++VzyRPR/9MjOf1JOtZoM5sMW7ivWahvU8YTDyOsYSp
E0K5NlIpZaZI8kfXkDV09UIzaxw2RwObDf6CNzRYWhG1kS/nTyA+5Ni6OjTck/6P
/7OB5TNXiGdWs6mf1NcdwGUPKYQH4w/NYBs5auLpuluGgtcA9tCHKBnQ7IHdhYmh
OYoaBdyH3PhVxxFM+lny+p4ILsr9wNkEBkU0ox+xGbp8MgrO5pKL0pFy0KqQwQxb
V/Y4o5xOXS4WgBeaxkZyDYRUsqytiur45+se4iKmH8q08H0kFEmZlhKVKecquZx9
MqTXbVIYqzUyx1hD8SnvtiDvDl3K7pb5EN41pfDrvcxlQ526Yrdtkurh4VmlRLr0
IuxGGP0Nxr1/Sb+WKA7Oi+iBQnoCKyC9InvlNGETmnqdyTeOuvYz/LzCbpB/cKUR
fkjAnQ+Dk8cIznfmjHp6IJw1
-----END CERTIFICATE-----`;

export const TLS_SERVER_KEY = `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`;
