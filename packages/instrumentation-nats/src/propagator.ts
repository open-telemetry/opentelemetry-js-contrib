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
import type { MsgHdrs } from 'nats';

/**
 * TextMapGetter for NATS MsgHdrs.
 */
export const natsHeadersGetter: TextMapGetter<MsgHdrs | undefined> = {
  get(carrier, key) {
    if (!carrier) {
      return undefined;
    }

    return carrier.get(key);
  },

  keys(carrier) {
    if (!carrier) {
      return [];
    }
    return [...carrier.keys()];
  },
};

/**
 * TextMapSetter for NATS MsgHdrs.
 */
export const natsHeadersSetter: TextMapSetter<MsgHdrs> = {
  set(carrier, key, value) {
    if (carrier) {
      carrier.set(key, value);
    }
  },
};
