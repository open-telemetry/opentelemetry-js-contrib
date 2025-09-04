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
import { diag } from '@opentelemetry/api';
import type { Attributes, DiagLogger } from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

/**
 * Read a boolean from an environment variable.
 *
 * https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#boolean
 *
 * @param {string} name
 * @returns {boolean | undefined}
 *    - Returns `undefined` if the envvar is not set on `process.env` or is
 *      the empty string. This indicates that no explicit value was given,
 *      which may be a useful distinction from an explicit `false` for callers.
 *    - Returns `true` iff the envvar value is the string "true" (case-insensitive).
 *    - Returns `false`, iff the envvar value is the string "false" (case-insensitive).
 *    - Otherwise, it `diag.warn()`s about the invalid value and returns
 *      `undefined` as a (falsey) fallback.
 * @throws if the envvar value is set and is not a string
 */
export function getEnvBool(
  name: string,
  diag_: DiagLogger = diag
): boolean | undefined {
  const val = process.env[name];
  if (val === undefined || val === '') {
    return undefined;
  } else if (typeof val !== 'string') {
    throw new Error(
      `invalid type for environment variable: ${typeof val} (${name}=${val})`
    );
  } else {
    const valLower = val.toLowerCase();
    if (valLower === 'true') {
      return true;
    } else if (valLower === 'false') {
      return false;
    } else {
      diag_.warn(
        `invalid boolean value for environment variable: ${name}=${val}; ignoring`
      );
      return undefined;
    }
  }
}

type PortFromProtocol = { [key: string]: number };
const SERVER_PORT_FROM_URL_PROTOCOL: PortFromProtocol = {
  'https:': 443,
  'http:': 80,
};

/**
 * Return span/metric attributes from the given OpenAI client baseURL.
 */
export function getAttrsFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): Attributes | undefined {
  if (!baseURL) {
    return;
  }

  // TODO: would be nice to LRU cache this, but probably not significant perf
  let u;
  try {
    u = new URL(baseURL);
  } catch (ex) {
    // Note: We should never get to this point as openai should crash prior to this.
    // Even if it did, instrumentation will still work except lacking these attributes.
    diag_.debug(
      `could not determine server.{address,port} from baseURL: ${ex}`
    );
    return;
  }

  return {
    [ATTR_SERVER_ADDRESS]: u.hostname,
    [ATTR_SERVER_PORT]: u.port
      ? Number(u.port)
      : SERVER_PORT_FROM_URL_PROTOCOL[u.protocol],
  };
}
