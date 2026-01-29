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

/**
 * Default URL sanitization function that redacts credentials and sensitive query parameters.
 * This is the default implementation used when no custom sanitizeUrl callback is provided.
 *
 * @param url - The URL to sanitize
 * @returns The sanitized URL with credentials and sensitive parameters redacted
 */
export function defaultSanitizeUrl(url: string): string {
  const sensitiveParams = [
    'password',
    'passwd',
    'secret',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'token',
    'access_token',
    'refresh_token',
    'jwt',
    'session',
    'sessionid',
    'key',
    'private_key',
    'client_secret',
    'client_id',
    'signature',
    'hash',
  ];
  try {
    const urlObj = new URL(url);

    // Redact credentials if present
    if (urlObj.username || urlObj.password) {
      urlObj.username = 'REDACTED';
      urlObj.password = 'REDACTED';
    }

    // Redact sensitive query parameters
    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, 'REDACTED');
      }
    }

    return urlObj.toString();
  } catch {
    // If URL parsing fails, redact credentials and sensitive query parameters
    // Use a more specific regex to avoid polynomial time complexity
    let sanitized = url.replace(/\/\/[^:/@]+:[^/@]+@/, '//REDACTED:REDACTED@');

    for (const param of sensitiveParams) {
      // Match param=value or param%3Dvalue (URL encoded)
      const regex = new RegExp(`([?&]${param}(?:%3D|=))[^&]*`, 'gi');
      sanitized = sanitized.replace(regex, '$1REDACTED');
    }

    return sanitized;
  }
}

/**
 * Determines if navigation between two URLs represents a hash change.
 * A hash change is true if the URLs are the same except for the hash part.
 *
 * @param fromUrl - The source URL
 * @param toUrl - The destination URL
 * @returns true if this represents a hash change navigation
 */
export function isHashChange(fromUrl: string, toUrl: string): boolean {
  try {
    const a = new URL(fromUrl, window.location.origin);
    const b = new URL(toUrl, window.location.origin);
    // Only consider it a hash change if:
    // 1. Base URL (origin + pathname + search) is identical
    // 2. Both URLs have hashes and they're different, OR we're adding a hash
    const sameBase =
      a.origin === b.origin &&
      a.pathname === b.pathname &&
      a.search === b.search;
    const fromHasHash = a.hash !== '';
    const toHasHash = b.hash !== '';
    const hashesAreDifferent = a.hash !== b.hash;

    return (
      sameBase &&
      hashesAreDifferent &&
      ((fromHasHash && toHasHash) || (!fromHasHash && toHasHash))
    );
  } catch {
    // Fallback: check if base URLs are identical and we're changing/adding hash (not removing)
    const fromBase = fromUrl.split('#')[0];
    const toBase = toUrl.split('#')[0];
    const fromHash = fromUrl.split('#')[1] || '';
    const toHash = toUrl.split('#')[1] || '';

    const sameBase = fromBase === toBase;
    const hashesAreDifferent = fromHash !== toHash;
    const notRemovingHash = toHash !== ''; // Only true if we're not removing the hash

    return sameBase && hashesAreDifferent && notRemovingHash;
  }
}
