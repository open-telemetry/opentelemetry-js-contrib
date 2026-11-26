/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */
import { TextMapGetter } from '@opentelemetry/api';

/*
same as open telemetry's `defaultTextMapGetter`,
but also handle case where header is buffer,
adding toString() to make sure string is returned
*/
export const bufferTextMapGetter: TextMapGetter = {
  get(carrier, key) {
    if (!carrier) {
      return undefined;
    }

    const keys = Object.keys(carrier);

    for (const carrierKey of keys) {
      if (carrierKey === key || carrierKey.toLowerCase() === key) {
        return carrier[carrierKey]?.toString();
      }
    }

    return undefined;
  },

  keys(carrier) {
    return carrier ? Object.keys(carrier) : [];
  },
};
