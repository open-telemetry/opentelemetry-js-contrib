/*
 * Copyright Splunk Inc., Aspecto
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  ATTR_NET_TRANSPORT,
} from './semconv';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAuth(connectionProvider: any) {
  if (connectionProvider._authenticationProvider) {
    return connectionProvider._authenticationProvider._authTokenManager
      ?._authToken;
  }

  return connectionProvider._authToken;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAttributesFromNeo4jSession(session: any) {
  const connectionHolder =
    (session._mode === 'WRITE'
      ? session._writeConnectionHolder
      : session._readConnectionHolder) ??
    session._connectionHolder ??
    {};
  const connectionProvider = connectionHolder._connectionProvider ?? {};

  // seedRouter is used when connecting to a url that starts with "neo4j", usually aura
  const address = connectionProvider._address ?? connectionProvider._seedRouter;
  const auth = getAuth(connectionProvider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attributes: Record<string, any> = {
    [ATTR_NET_TRANSPORT]: 'IP.TCP',
    // "neo4j" is the default database name. When used, "session._database" is an empty string
    [ATTR_DB_NAME]: session._database ? session._database : 'neo4j',
  };
  if (address) {
    attributes[ATTR_NET_PEER_NAME] = address._host;
    attributes[ATTR_NET_PEER_PORT] = address._port;
  }

  if (auth?.principal) {
    attributes[ATTR_DB_USER] = auth.principal;
  }
  return attributes;
}
