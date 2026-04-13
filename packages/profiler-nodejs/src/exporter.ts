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

import type {
  DatakitProfilingExporterOptions,
  ProfileBatch,
  ProfileExporter,
} from './types';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:9529/profiling/v1/input';
const DEFAULT_TIMEOUT_MILLIS = 30_000;

export class DatakitProfilingExporter implements ProfileExporter {
  private readonly endpoint: string;
  private readonly timeoutMillis: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DatakitProfilingExporterOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMillis = options.timeoutMillis ?? DEFAULT_TIMEOUT_MILLIS;
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('global fetch is not available');
    }
  }

  async export(batch: ProfileBatch): Promise<void> {
    const form = new FormData();

    for (const profile of batch.profiles) {
      form.append(
        profile.type,
        new Blob([new Uint8Array(profile.data)], {
          type: 'application/octet-stream',
        }),
        profile.filename
      );
    }

    form.append(
      'event',
      new Blob([JSON.stringify(this.serializeEvent(batch))], {
        type: 'application/json',
      }),
      'event.json'
    );

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      body: form,
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMillis),
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new Error(
        `datakit profiling export failed: ${response.status} ${response.statusText}${body}`
      );
    }

    diag.debug(
      `Datakit profiling export succeeded for ${batch.profiles.length} profile(s)`
    );
  }

  async shutdown(): Promise<void> {}

  private serializeEvent(batch: ProfileBatch) {
    return {
      version: '4',
      profiler: 'ddtrace',
      attachments: batch.profiles.map(profile => profile.filename),
      start: formatDatakitTimestamp(batch.startTime),
      end: formatDatakitTimestamp(batch.endTime),
      family: batch.family,
      format: batch.format,
      tags_profiler: joinTags(batch.tags),
    };
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text === '') {
      return '';
    }
    return ` - ${text.slice(0, 300)}`;
  } catch {
    return '';
  }
}

function joinTags(tags: Record<string, string>): string {
  return Object.entries(tags)
    .filter(([, value]) => value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

function formatDatakitTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
