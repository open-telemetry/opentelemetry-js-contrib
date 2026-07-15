/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as Memcached from 'memcached';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { Attributes } from '@opentelemetry/api';

export const getPeerAttributes = (
  client: any /* Memcached, but the type definitions are lacking */,
  server: string | undefined,
  query: Memcached.CommandData
): Attributes => {
  if (!server) {
    if (client.servers.length === 1) {
      server = client.servers[0];
    } else {
      let redundancy =
        client.redundancy && client.redundancy < client.servers.length;
      const queryRedundancy = query.redundancyEnabled;

      if (redundancy && queryRedundancy) {
        redundancy = client.HashRing.range(
          query.key,
          client.redundancy + 1,
          true
        );
        server = redundancy.shift();
      } else {
        server = client.HashRing.get(query.key);
      }
    }
  }

  if (typeof server === 'string') {
    const [host, port] = server && server.split(':');
    if (host && port) {
      const portNumber = parseInt(port, 10);
      const attrs: Attributes = {};

      attrs[ATTR_SERVER_ADDRESS] = host;
      if (!isNaN(portNumber)) {
        attrs[ATTR_SERVER_PORT] = portNumber;
      }

      return attrs;
    }
    if (host) {
      const attrs: Attributes = {};
      attrs[ATTR_SERVER_ADDRESS] = host;
      return attrs;
    }
  }
  return {};
};
