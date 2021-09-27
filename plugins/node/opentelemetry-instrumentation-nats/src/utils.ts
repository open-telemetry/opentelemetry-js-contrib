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

import { TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { ServerInfo, Msg, MsgHdrs } from 'nats';

export function baseTraceAttrs(info: ServerInfo | undefined) {
  const attributes = {
    [SemanticAttributes.MESSAGING_SYSTEM]: 'nats',
    [SemanticAttributes.MESSAGING_PROTOCOL]: 'nats',
  };
  if (info) {
    attributes[SemanticAttributes.MESSAGING_PROTOCOL_VERSION] = info.version;
    attributes[SemanticAttributes.NET_PEER_NAME] = info.host;
    attributes[SemanticAttributes.NET_PEER_PORT] = `${info.port}`;
    if (info.client_ip) {
      attributes[SemanticAttributes.NET_PEER_IP] = info.client_ip;
    }
  }
  return attributes;
}

export function traceAttrs(info: ServerInfo | undefined, m: Msg) {
  const attributes = {
    ...baseTraceAttrs(info),
    [SemanticAttributes.MESSAGING_DESTINATION]: m.subject,
    [SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: m.data
      ? m.data.length
      : 0,
  };

  if (m.reply) {
    attributes[SemanticAttributes.MESSAGING_CONVERSATION_ID] = m.reply;
  }

  return attributes;
}

export const natsContextGetter: TextMapGetter<MsgHdrs> = {
  keys(h: MsgHdrs) {
    if (h == null) return [];
    // MsgHdrs type is missing "keys" function. But exists in implementation
    // https://github.com/nats-io/nats.deno/blob/c560da31ffa17601ec2e56fee0aa351d8c6a0d07/nats-base-client/headers.ts#L191-L197
    return (h as any).keys();
  },

  get(h: MsgHdrs, key: string) {
    if (h == null) return undefined;
    const res = h.get(key);
    return res === '' ? undefined : res;
  },
};

export const natsContextSetter: TextMapSetter<MsgHdrs> = {
  set(h: MsgHdrs, key: string, value: string) {
    if (h == null) return;
    h.set(key, value);
  },
};
