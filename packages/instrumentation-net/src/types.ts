/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface NetInstrumentationConfig extends InstrumentationConfig {
  /**
   * Require a parent span in order to create net spans, default when unset is
   * `false`.
   *
   * Connections opened outside of a request - a database driver's background
   * heartbeat, for example - would otherwise each produce a standalone
   * single-span trace.
   */
  requireParentSpan?: boolean;
}

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
