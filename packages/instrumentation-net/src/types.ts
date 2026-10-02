/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/* The following attributes are not official, see open-telemetry/opentelemetry-specification#1652 */
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
