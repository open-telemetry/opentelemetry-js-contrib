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

import type * as Memcached from 'memcached';
import {
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';

export const getPeerAttributes = (
  client: any /* Memcached, but the type definitions are lacking */,
  server: string | undefined,
  query: Memcached.CommandData
) => {
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
      if (!isNaN(portNumber)) {
        return {
          [SEMATTRS_NET_PEER_NAME]: host,
          [SEMATTRS_NET_PEER_PORT]: portNumber,
        };
      }
      return {
        [SEMATTRS_NET_PEER_NAME]: host,
      };
    }
  }
  return {};
};
