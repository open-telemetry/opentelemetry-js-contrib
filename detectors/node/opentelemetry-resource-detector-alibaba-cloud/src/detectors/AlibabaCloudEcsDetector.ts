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

import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ResourceDetector,
  DetectedResource,
  DetectedResourceAttributes,
} from '@opentelemetry/resources';
import {
  CLOUDPLATFORMVALUES_ALIBABA_CLOUD_ECS,
  CLOUDPROVIDERVALUES_ALIBABA_CLOUD,
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_CLOUD_AVAILABILITY_ZONE,
  SEMRESATTRS_CLOUD_PLATFORM,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_REGION,
  SEMRESATTRS_HOST_ID,
  SEMRESATTRS_HOST_NAME,
  SEMRESATTRS_HOST_TYPE,
} from '@opentelemetry/semantic-conventions';

import * as http from 'http';

/**
 * The AlibabaCloudEcsDetector can be used to detect if a process is running in
 * AlibabaCloud ECS and return a {@link Resource} populated with metadata about
 * the ECS instance. Returns an empty Resource if detection fails.
 */
class AlibabaCloudEcsDetector implements ResourceDetector {
  /**
   * See https://www.alibabacloud.com/help/doc-detail/67254.htm for
   * documentation about the AlibabaCloud instance identity document.
   */
  readonly ALIBABA_CLOUD_IDMS_ENDPOINT = '100.100.100.200';
  readonly ALIBABA_CLOUD_INSTANCE_IDENTITY_DOCUMENT_PATH =
    '/latest/dynamic/instance-identity/document';
  readonly ALIBABA_CLOUD_INSTANCE_HOST_DOCUMENT_PATH =
    '/latest/meta-data/hostname';
  readonly MILLISECONDS_TIME_OUT = 1000;

  /**
   * Attempts to connect and obtain an AlibabaCloud instance Identity document.
   * If the connection is successful it returns a promise containing a
   * {@link Resource} populated with instance metadata.
   *
   * @param config (unused) The resource detection config
   */
  detect(): DetectedResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return { attributes };
  }

  /** Gets identity and host info and returns them as attribs. Empty object if fails */
  _getAttributes(): DetectedResourceAttributes {
    const dataP = Promise.all([this._fetchIdentity(), this._fetchHost()]);

    return {
      [SEMRESATTRS_CLOUD_PROVIDER]: dataP.then(
        () => CLOUDPROVIDERVALUES_ALIBABA_CLOUD
      ),
      [SEMRESATTRS_CLOUD_PLATFORM]: dataP.then(
        () => CLOUDPLATFORMVALUES_ALIBABA_CLOUD_ECS
      ),

      // Data from _fetchIdentity()
      [SEMRESATTRS_CLOUD_ACCOUNT_ID]: dataP.then(
        data => data[0]['owner-account-id']
      ),
      [SEMRESATTRS_CLOUD_REGION]: dataP.then(data => data[0]['region-id']),
      [SEMRESATTRS_CLOUD_AVAILABILITY_ZONE]: dataP.then(
        data => data[0]['zone-id']
      ),
      [SEMRESATTRS_HOST_ID]: dataP.then(data => data[0]['instance-id']),
      [SEMRESATTRS_HOST_TYPE]: dataP.then(data => data[0]['instance-type']),

      // Data from _fetchHost()
      [SEMRESATTRS_HOST_NAME]: dataP.then(data => data[1]),
    };
  }

  /**
   * Fetch AlibabaCloud instance document url with http requests. If the
   * application is running on an ECS instance, we should be able to get back a
   * valid JSON document. Parses that document and stores the identity
   * properties in a local map.
   */
  private async _fetchIdentity(): Promise<any> {
    const options = {
      host: this.ALIBABA_CLOUD_IDMS_ENDPOINT,
      path: this.ALIBABA_CLOUD_INSTANCE_IDENTITY_DOCUMENT_PATH,
      method: 'GET',
      timeout: this.MILLISECONDS_TIME_OUT,
    };
    const identity = await this._fetchString(options);
    return JSON.parse(identity);
  }

  private async _fetchHost(): Promise<string> {
    const options = {
      host: this.ALIBABA_CLOUD_IDMS_ENDPOINT,
      path: this.ALIBABA_CLOUD_INSTANCE_HOST_DOCUMENT_PATH,
      method: 'GET',
      timeout: this.MILLISECONDS_TIME_OUT,
    };
    return await this._fetchString(options);
  }

  private async _fetchString(options: http.RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        req.destroy(new Error('ECS metadata api request timed out.'));
      }, this.MILLISECONDS_TIME_OUT);

      const req = http.request(options, res => {
        clearTimeout(timeoutId);
        const { statusCode } = res;
        if (
          typeof statusCode !== 'number' ||
          !(statusCode >= 200 && statusCode < 300)
        ) {
          res.destroy();
          return reject(
            new Error(`Failed to load page, status code: ${statusCode}`)
          );
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => (rawData += chunk));
        res.on('error', err => {
          reject(err);
        });
        res.on('end', () => {
          resolve(rawData);
        });
      });
      req.on('error', err => {
        clearTimeout(timeoutId);
        reject(err);
      });
      req.end();
    });
  }
}

export const alibabaCloudEcsDetector = new AlibabaCloudEcsDetector();
