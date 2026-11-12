/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Value that replaces sensitive parts of a URL.
 */
export const STR_REDACTED = 'REDACTED';

/**
 * Query string keys whose values are redacted. This is the list from the URL
 * semantic conventions and matches `@opentelemetry/instrumentation-http`.
 * Keys are matched exactly (case-sensitive).
 *
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/url/
 */
export const REDACTED_QUERY_PARAMS: readonly string[] = [
  'sig',
  'Signature',
  'AWSAccessKeyId',
  'X-Goog-Signature',
  'X-Amz-Signature',
  'X-Amz-Credential',
  'X-Amz-Security-Token',
];

function decodeQueryKey(key: string): string {
  try {
    return decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    return key;
  }
}

/**
 * Matches the start of an absolute (`scheme://`) or protocol-relative (`//`)
 * URL and captures its authority (`user:pass@host:port`). Backslashes are
 * accepted in place of slashes, because WHATWG URL parsers treat `\` like `/`.
 *
 * The input is user supplied and may be malicious, so this pattern is kept
 * linear-time (no ReDoS):
 * - it is anchored with `^`, so it is only attempted at position 0;
 * - the scheme class `[a-zA-Z0-9+.-]` cannot match `:`, so the scheme has
 *   exactly one possible end and backtracking over it fails in O(1) per step;
 * - `[^/\\?#]*` is the last element, so it never needs to backtrack.
 */
const AUTHORITY_REGEX = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?[/\\]{2}([^/\\?#]*)/;

/**
 * Redacts the values of sensitive keys in a query string.
 *
 * @param query query string, with or without the leading `?`
 * @returns the query string (keeping a leading `?` if one was given),
 *   unchanged byte-for-byte if nothing was redacted
 */
export function redactQueryString(query: string): string {
  const hasPrefix = query.startsWith('?');
  const body = hasPrefix ? query.slice(1) : query;
  if (body.length === 0) {
    return query;
  }

  let redacted = false;
  const pairs = body.split('&').map(pair => {
    const separator = pair.indexOf('=');
    const key = separator === -1 ? pair : pair.slice(0, separator);
    if (REDACTED_QUERY_PARAMS.includes(decodeQueryKey(key))) {
      redacted = true;
      return `${key}=${STR_REDACTED}`;
    }
    return pair;
  });

  if (!redacted) {
    return query;
  }
  return (hasPrefix ? '?' : '') + pairs.join('&');
}

/**
 * Redacts credentials (userinfo) and the values of sensitive query string
 * keys of a URL before it is recorded as a span attribute.
 *
 * Works on absolute URLs as well as on relative ones (e.g. `/path?query`).
 * A URL with nothing to redact is returned unchanged, byte-for-byte.
 *
 * @param url the URL to redact
 */
export function redactUrl(url: string): string {
  let result = url;

  // Credentials can only be present in an authority (`scheme://user:pass@host`
  // or a protocol-relative `//user:pass@host`).
  const authorityMatch = AUTHORITY_REGEX.exec(result);
  if (authorityMatch && authorityMatch[1].includes('@')) {
    const authority = authorityMatch[1];
    const authorityStart = authorityMatch[0].length - authority.length;
    let replaced = false;
    try {
      const parsed = new URL(result);
      if (parsed.username || parsed.password) {
        parsed.username = STR_REDACTED;
        parsed.password = STR_REDACTED;
        result = parsed.href;
      }
      replaced = true;
    } catch {
      // Not parseable on its own (e.g. protocol-relative); handled below.
    }
    if (!replaced) {
      const at = authority.lastIndexOf('@');
      result =
        result.slice(0, authorityStart) +
        `${STR_REDACTED}:${STR_REDACTED}@` +
        result.slice(authorityStart + at + 1);
    }
  }

  const fragmentStart = result.indexOf('#');
  const queryStart = result.indexOf('?');
  if (
    queryStart === -1 ||
    (fragmentStart !== -1 && fragmentStart < queryStart)
  ) {
    return result;
  }
  const queryEnd = fragmentStart === -1 ? result.length : fragmentStart;
  const query = result.slice(queryStart, queryEnd);
  const redactedQuery = redactQueryString(query);
  if (redactedQuery === query) {
    return result;
  }
  return result.slice(0, queryStart) + redactedQuery + result.slice(queryEnd);
}
