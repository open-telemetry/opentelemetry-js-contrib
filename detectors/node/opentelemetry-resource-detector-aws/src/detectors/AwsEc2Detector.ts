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

import {
  DetectorSync,
  IResource,
  Resource,
  ResourceAttributes,
  ResourceDetectionConfig,
} from '@opentelemetry/resources';
import {
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_PLATFORM,
  SEMRESATTRS_CLOUD_REGION,
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_CLOUD_AVAILABILITY_ZONE,
  SEMRESATTRS_HOST_ID,
  SEMRESATTRS_HOST_TYPE,
  SEMRESATTRS_HOST_NAME,
  CLOUDPROVIDERVALUES_AWS,
  CLOUDPLATFORMVALUES_AWS_EC2,
} from '@opentelemetry/semantic-conventions';
import * as http from 'http';

/**
 * The AwsEc2Detector can be used to detect if a process is running in AWS EC2
 * and return a {@link Resource} populated with metadata about the EC2
 * instance. Returns an empty Resource if detection fails.
 */
class AwsEc2Detector implements DetectorSync {
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

  detect(_config?: ResourceDetectionConfig): IResource {
    return new Resource({}, this._getAttributes());
  }

  /**
   * Attempts to connect and obtain an AWS instance Identity document. If the
   * connection is successful it returns a promise containing a {@link ResourceAttributes}
   * object with instance metadata. Returns a promise containing an
   * empty {@link ResourceAttributes} if the connection or parsing of the identity
   * document fails.
   */
  async _getAttributes(): Promise<ResourceAttributes> {
    try {
      const token = await this._fetchToken();
      const { accountId, instanceId, instanceType, region, availabilityZone } =
        await this._fetchIdentity(token);
      const hostname = await this._fetchHost(token);

      return {
        [SEMRESATTRS_CLOUD_PROVIDER]: CLOUDPROVIDERVALUES_AWS,
        [SEMRESATTRS_CLOUD_PLATFORM]: CLOUDPLATFORMVALUES_AWS_EC2,
        [SEMRESATTRS_CLOUD_ACCOUNT_ID]: accountId,
        [SEMRESATTRS_CLOUD_REGION]: region,
        [SEMRESATTRS_CLOUD_AVAILABILITY_ZONE]: availabilityZone,
        [SEMRESATTRS_HOST_ID]: instanceId,
        [SEMRESATTRS_HOST_TYPE]: instanceType,
        [SEMRESATTRS_HOST_NAME]: hostname,
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
