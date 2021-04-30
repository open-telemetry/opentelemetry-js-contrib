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

import type * as net from 'net';

export type Net = typeof net;

export interface NormalizedOptions {
  host?: string;
  port?: number;
  path?: string;
}

export enum SocketEvent {
  CLOSE = 'close',
  CONNECT = 'connect',
  ERROR = 'error',
  SECURE_CONNECT = 'secureConnect',
}

/* The following attributes are not offical, see open-telemetry/opentelemetry-specification#1652 */
export enum TLSAttributes {
  PROTOCOL = 'tls.protocol',
  AUTHORIZED = 'tls.authorized',
  CIPHER_NAME = 'tls.cipher.name',
  CIPHER_VERSION = 'tls.cipher.version',
  CERTIFICATE_FINGERPRINT = 'tls.certificate.fingerprint',
  CERTIFICATE_SERIAL_NUMBER = 'tls.certificate.serialNumber',
  CERTIFICATE_VALID_FROM = 'tls.certificate.validFrom',
  CERTIFICATE_VALID_TO = 'tls.certificate.validTo',
  ALPN_PROTOCOL = 'tls.alpnProtocol',
}
