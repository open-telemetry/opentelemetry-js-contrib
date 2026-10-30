/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from 'os';
import type { Attributes } from '@opentelemetry/api';
import {
  NETWORK_TRANSPORT_VALUE_PIPE,
  NETWORK_TRANSPORT_VALUE_UNIX,
} from '@opentelemetry/semantic-conventions';
import type { TLSSocket } from 'tls';
import { NormalizedOptions } from './internal-types';
import {
  ATTR_TLS_CIPHER,
  ATTR_TLS_ESTABLISHED,
  ATTR_TLS_NEXT_PROTOCOL,
  ATTR_TLS_PROTOCOL_NAME,
  ATTR_TLS_PROTOCOL_VERSION,
  ATTR_TLS_SERVER_HASH_SHA1,
  ATTR_TLS_SERVER_HASH_SHA256,
  ATTR_TLS_SERVER_NOT_AFTER,
  ATTR_TLS_SERVER_NOT_BEFORE,
  NET_TRANSPORT_VALUE_PIPE,
  TLS_PROTOCOL_NAME_VALUE_SSL,
  TLS_PROTOCOL_NAME_VALUE_TLS,
} from './semconv';

// There is no `NET_TRANSPORT_VALUE_UNIX` because breaking change
// https://github.com/open-telemetry/opentelemetry-specification/pull/3426
// *removed* it. This was from before semconv got more careful of removals.
export const OLD_IPC_TRANSPORT_VALUE =
  platform() === 'win32' ? NET_TRANSPORT_VALUE_PIPE : 'unix';
export const STABLE_IPC_TRANSPORT_VALUE =
  platform() === 'win32'
    ? NETWORK_TRANSPORT_VALUE_PIPE
    : NETWORK_TRANSPORT_VALUE_UNIX;

function getHost(args: unknown[]) {
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

export function getNormalizedArgs(
  args: unknown[]
): NormalizedOptions | null | undefined {
  const opt = args[0];
  if (!opt) {
    return;
  }

  switch (typeof opt) {
    case 'number':
      return {
        port: opt,
        host: getHost(args),
      };
    case 'object':
      if (Array.isArray(opt)) {
        return getNormalizedArgs(opt);
      }
      return opt;
    case 'string': {
      const maybePort = Number(opt);
      if (maybePort >= 0) {
        return {
          port: maybePort,
          host: getHost(args),
        };
      }

      return {
        path: opt,
      };
    }
    default:
      return;
  }
}

/**
 * Parse the negotiated protocol string from `tlsSocket.getProtocol()` (e.g.
 * 'TLSv1.3', 'TLSv1', 'SSLv3') into the `tls.protocol.name` and
 * `tls.protocol.version` semconv attributes. Returns an empty object for
 * values that cannot be parsed, such as `null` or 'unknown'.
 */
export function getTLSProtocolAttributes(
  protocol: string | null | undefined
): Attributes {
  const match = /^(TLS|SSL)v(\d+(?:\.\d+)*)$/.exec(protocol ?? '');
  if (!match) {
    return {};
  }
  return {
    [ATTR_TLS_PROTOCOL_NAME]:
      match[1] === 'TLS'
        ? TLS_PROTOCOL_NAME_VALUE_TLS
        : TLS_PROTOCOL_NAME_VALUE_SSL,
    [ATTR_TLS_PROTOCOL_VERSION]: match[2],
  };
}

/**
 * Node.js formats certificate fingerprints as colon-separated uppercase hex
 * (e.g. '95:DD:2A:...'). Semconv expects a plain uppercase hash.
 */
function formatFingerprint(fingerprint: string | undefined) {
  return fingerprint ? fingerprint.replace(/:/g, '').toUpperCase() : undefined;
}

function toISODate(date: string | undefined) {
  if (!date) {
    return undefined;
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Get the `tls.*` attributes of an established client TLS connection.
 *
 * `instrumentation-net` patches `connect`, so the instrumented process is
 * always the client: the peer certificate is the one offered by the server.
 */
export function getTLSAttributes(socket: TLSSocket): Attributes {
  const attributes: Attributes = {
    [ATTR_TLS_ESTABLISHED]: true,
    ...getTLSProtocolAttributes(socket.getProtocol()),
  };

  const cipher = socket.getCipher();
  if (cipher?.standardName) {
    attributes[ATTR_TLS_CIPHER] = cipher.standardName;
  }

  if (socket.alpnProtocol) {
    attributes[ATTR_TLS_NEXT_PROTOCOL] = socket.alpnProtocol;
  }

  const peerCertificate = socket.getPeerCertificate();
  if (peerCertificate) {
    const sha1 = formatFingerprint(peerCertificate.fingerprint);
    const sha256 = formatFingerprint(peerCertificate.fingerprint256);
    const notBefore = toISODate(peerCertificate.valid_from);
    const notAfter = toISODate(peerCertificate.valid_to);
    if (sha1) {
      attributes[ATTR_TLS_SERVER_HASH_SHA1] = sha1;
    }
    if (sha256) {
      attributes[ATTR_TLS_SERVER_HASH_SHA256] = sha256;
    }
    if (notBefore) {
      attributes[ATTR_TLS_SERVER_NOT_BEFORE] = notBefore;
    }
    if (notAfter) {
      attributes[ATTR_TLS_SERVER_NOT_AFTER] = notAfter;
    }
  }

  return attributes;
}
