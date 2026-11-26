/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */

export const extractTableFromQuery = (query: string | null | undefined) => {
  try {
    const result = query?.match(/(?<=from|join|truncate)\s+"?`?(\w+)"?`?/gi);
    if (!Array.isArray(result)) return;

    return result
      .map(table =>
        table
          .trim()
          .replace(/^"(.*)"$/, '$1')
          .replace(/^`(.*)`$/, '$1')
      )
      .sort()
      .join(',');
  } catch {
    return;
  }
};
