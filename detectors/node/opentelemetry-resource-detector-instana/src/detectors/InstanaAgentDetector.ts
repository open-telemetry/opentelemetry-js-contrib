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
import { Detector, Resource } from '@opentelemetry/resources';
import { diag } from '@opentelemetry/api';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import * as http from 'http';

class InstanaAgentDetector implements Detector {
  readonly INSTANA_AGENT_DEFAULT_HOST = 'localhost';
  readonly INSTANA_AGENT_DEFAULT_PORT = 42699;

  async detect(): Promise<Resource> {
    const host =
      process.env.INSTANA_AGENT_HOST || this.INSTANA_AGENT_DEFAULT_HOST;
    const port = Number(
      process.env.INSTANA_AGENT_PORT || this.INSTANA_AGENT_DEFAULT_PORT
    );

    const data = await this._retryHandler(host, port, 0);

    return new Resource({
      [SemanticResourceAttributes.PROCESS_PID]: data.pid,
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: data.agentUuid,
    });
  }

  private timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms).unref());
  }

  private async _retryHandler(
    host: string,
    port: number,
    tries: number
  ): Promise<{ pid: number; agentUuid: string }> {
    const MAX_TRIES = 3;

    try {
      return await this._fetchAgentData(host, port);
    } catch (err) {
      if (tries < MAX_TRIES) {
        diag.debug(
          `Retrying to connect to the Instana agent on ${host}:${port}....`
        );

        const retryTimeout = process.env.INSTANA_RETRY_TIMEOUT_MS
          ? Number(process.env.INSTANA_RETRY_TIMEOUT_MS)
          : 1000;

        await this.timeout(retryTimeout);
        return await this._retryHandler(host, port, tries + 1);
      }

      throw err;
    }
  }

  private async _fetchAgentData(
    host: string,
    port: number
  ): Promise<{ pid: number; agentUuid: string }> {
    const agentTimeoutMs = process.env.INSTANA_AGENT_TIMEOUT_MS
      ? Number(process.env.INSTANA_AGENT_TIMEOUT_MS)
      : 3 * 1000;

    const payload = {
      pid: process.pid,
    };

    const payloadStr = JSON.stringify(payload);
    const contentLength = Buffer.from(payloadStr, 'utf8').length;
    diag.debug(`Instana Agent: ${host}, ${port}`);

    return new Promise((resolve, reject) => {
      const opts = {
        host,
        port,
        method: 'PUT',
        path: '/com.instana.plugin.nodejs.discovery',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Length': contentLength,
        },
        timeout: agentTimeoutMs,
      };

      const req = http.request(opts, res => {
        res.setEncoding('utf8');
        let rawData = '';

        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode !== 200) {
            return reject(
              new Error(`Instana Agent returned status code ${res.statusCode}`)
            );
          }

          try {
            const data = JSON.parse(rawData);

            if (data.pid && data.agentUuid) {
              return resolve(data);
            }

            reject(
              new Error(`Invalid Instana Agent response format: ${data}.`)
            );
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('timeout', () =>
        reject(new Error('Instana Agent request timed out.'))
      );
      req.on('error', err => reject(err));

      req.write(Buffer.from(payloadStr), 'utf8');
      req.end();
    });
  }
}

export const instanaAgentDetector = new InstanaAgentDetector();
