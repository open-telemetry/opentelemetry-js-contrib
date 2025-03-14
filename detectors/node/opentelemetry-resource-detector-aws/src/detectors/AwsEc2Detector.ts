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
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_REGION,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_HOST_ID,
  ATTR_HOST_TYPE,
  ATTR_HOST_NAME,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_EC2,
} from '../semconv';
import * as http from 'http';

/**
 * The AwsEc2Detector can be used to detect if a process is running in AWS EC2
 * and return resource attributes with metadata about the EC2 instance.
 */
class AwsEc2Detector implements ResourceDetector {
  /**
   * See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
   * for documentation about the AWS instance identity document
   * and standard of IMDSv2.
   */
  readonly AWS_IDMS_ENDPOINT = '169.254.169.254';
  readonly AWS_INSTANCE_TOKEN_DOCUMENT_PATH = '/latest/api/token';
  readonly AWS_INSTANCE_IDENTITY_DOCUMENT_PATH =
    '/latest/dynamic/instance-identity/document';
  readonly AWS_INSTANCE_HOST_DOCUMENT_PATH = '/latest/meta-data/hostname';
  readonly AWS_METADATA_TTL_HEADER = 'X-aws-ec2-metadata-token-ttl-seconds';
  readonly AWS_METADATA_TOKEN_HEADER = 'X-aws-ec2-metadata-token';
  readonly MILLISECOND_TIME_OUT = 5000;

  detect(): DetectedResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return { attributes };
  }

  _getAttributes(): DetectedResourceAttributes {
    try {
      const dataP = this._fetchToken().then(token =>
        Promise.all([this._fetchIdentity(token), this._fetchHost(token)])
      );

      return {
        [ATTR_CLOUD_PROVIDER]: dataP.then(() => CLOUD_PROVIDER_VALUE_AWS),
        [ATTR_CLOUD_PLATFORM]: dataP.then(() => CLOUD_PLATFORM_VALUE_AWS_EC2),

        // Data from _fetchIdentity()
        [ATTR_CLOUD_ACCOUNT_ID]: dataP.then(data => data[0].accountId),
        [ATTR_CLOUD_REGION]: dataP.then(data => data[0].region),
        [ATTR_CLOUD_AVAILABILITY_ZONE]: dataP.then(
          data => data[0].availabilityZone
        ),
        [ATTR_HOST_ID]: dataP.then(data => data[0].instanceId),
        [ATTR_HOST_TYPE]: dataP.then(data => data[0].instanceType),

        // Data from _fetchHost()
        [ATTR_HOST_NAME]: dataP.then(data => data[1]),
      };
    } catch {
      return {};
    }
  }

  private async _fetchToken(): Promise<string> {
    const options = {
      host: this.AWS_IDMS_ENDPOINT,
      path: this.AWS_INSTANCE_TOKEN_DOCUMENT_PATH,
      method: 'PUT',
      timeout: this.MILLISECOND_TIME_OUT,
      headers: {
        [this.AWS_METADATA_TTL_HEADER]: '60',
      },
    };
    return await this._fetchString(options);
  }

  private async _fetchIdentity(token: string): Promise<any> {
    const options = {
      host: this.AWS_IDMS_ENDPOINT,
      path: this.AWS_INSTANCE_IDENTITY_DOCUMENT_PATH,
      method: 'GET',
      timeout: this.MILLISECOND_TIME_OUT,
      headers: {
        [this.AWS_METADATA_TOKEN_HEADER]: token,
      },
    };
    const identity = await this._fetchString(options);
    return JSON.parse(identity);
  }

  private async _fetchHost(token: string): Promise<string> {
    const options = {
      host: this.AWS_IDMS_ENDPOINT,
      path: this.AWS_INSTANCE_HOST_DOCUMENT_PATH,
      method: 'GET',
      timeout: this.MILLISECOND_TIME_OUT,
      headers: {
        [this.AWS_METADATA_TOKEN_HEADER]: token,
      },
    };
    return await this._fetchString(options);
  }

  /**
   * Establishes an HTTP connection to AWS instance document url.
   * If the application is running on an EC2 instance, we should be able
   * to get back a valid JSON document. Parses that document and stores
   * the identity properties in a local map.
   */
  private async _fetchString(options: http.RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        req.abort();
        reject(new Error('EC2 metadata api request timed out.'));
      }, this.MILLISECOND_TIME_OUT);

      const req = http.request(options, res => {
        clearTimeout(timeoutId);
        const { statusCode } = res;
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => {
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            try {
              resolve(rawData);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(
              new Error('Failed to load page, status code: ' + statusCode)
            );
          }
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

export const awsEc2Detector = new AwsEc2Detector();
