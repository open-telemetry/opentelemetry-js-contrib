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
import { Detector, Resource } from '@opentelemetry/resources';
import {
  CloudProviderValues,
  CloudPlatformValues,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import * as http from 'http';
import * as util from 'util';
import * as fs from 'fs';
import * as os from 'os';
import { getEnv } from '@opentelemetry/core';

const HTTP_TIMEOUT_IN_MS = 1000;

interface AwsLogOptions {
  readonly 'awslogs-region'?: string;
  readonly 'awslogs-group'?: string;
  readonly 'awslogs-stream'?: string;
}

/**
 * The AwsEcsDetector can be used to detect if a process is running in AWS
 * ECS and return a {@link Resource} populated with data about the ECS
 * plugins of AWS X-Ray. Returns an empty Resource if detection fails.
 */
export class AwsEcsDetector implements Detector {
  static readonly CONTAINER_ID_LENGTH = 64;
  static readonly DEFAULT_CGROUP_PATH = '/proc/self/cgroup';

  private static readFileAsync = util.promisify(fs.readFile);

  async detect(): Promise<Resource> {
    const env = getEnv();
    if (!env.ECS_CONTAINER_METADATA_URI_V4 && !env.ECS_CONTAINER_METADATA_URI) {
      diag.debug('AwsEcsDetector failed: Process is not on ECS');
      return Resource.empty();
    }

    let resource = new Resource({
      [SemanticResourceAttributes.CLOUD_PROVIDER]: CloudProviderValues.AWS,
      [SemanticResourceAttributes.CLOUD_PLATFORM]: CloudPlatformValues.AWS_ECS,
    }).merge(await AwsEcsDetector._getContainerIdAndHostnameResource());

    const metadataUrl = getEnv().ECS_CONTAINER_METADATA_URI_V4;
    if (metadataUrl) {
      const [containerMetadata, taskMetadata] = await Promise.all([
        AwsEcsDetector._getUrlAsJson(metadataUrl),
        AwsEcsDetector._getUrlAsJson(`${metadataUrl}/task`),
      ]);

      const metadatav4Resource = await AwsEcsDetector._getMetadataV4Resource(
        containerMetadata,
        taskMetadata
      );
      const logsResource = await AwsEcsDetector._getLogResource(
        containerMetadata
      );

      resource = resource.merge(metadatav4Resource).merge(logsResource);
    }

    return resource;
  }

  /**
   * Read container ID from cgroup file
   * In ECS, even if we fail to find target file
   * or target file does not contain container ID
   * we do not throw an error but throw warning message
   * and then return null string
   */
  private static async _getContainerIdAndHostnameResource(): Promise<Resource> {
    const hostName = os.hostname();

    let containerId = '';
    try {
      const rawData = await AwsEcsDetector.readFileAsync(
        AwsEcsDetector.DEFAULT_CGROUP_PATH,
        'utf8'
      );
      const splitData = rawData.trim().split('\n');
      for (const str of splitData) {
        if (str.length > AwsEcsDetector.CONTAINER_ID_LENGTH) {
          containerId = str.substring(
            str.length - AwsEcsDetector.CONTAINER_ID_LENGTH
          );
          break;
        }
      }
    } catch (e) {
      diag.warn('AwsEcsDetector failed to read container ID', e);
    }

    if (hostName || containerId) {
      return new Resource({
        [SemanticResourceAttributes.CONTAINER_NAME]: hostName || '',
        [SemanticResourceAttributes.CONTAINER_ID]: containerId || '',
      });
    }

    return Resource.empty();
  }

  private static async _getMetadataV4Resource(
    containerMetadata: any,
    taskMetadata: any
  ): Promise<Resource> {
    const launchType: string = taskMetadata['LaunchType'];
    const taskArn: string = taskMetadata['TaskARN'];

    const baseArn: string = taskArn.substring(0, taskArn.lastIndexOf(':'));
    const cluster: string = taskMetadata['Cluster'];

    const clusterArn = cluster.startsWith('arn:')
      ? cluster
      : `${baseArn}:cluster/${cluster}`;

    const containerArn: string = containerMetadata['ContainerARN'];

    // https://github.com/open-telemetry/opentelemetry-specification/blob/main/semantic_conventions/resource/cloud_provider/aws/ecs.yaml
    return new Resource({
      [SemanticResourceAttributes.AWS_ECS_CONTAINER_ARN]: containerArn,
      [SemanticResourceAttributes.AWS_ECS_CLUSTER_ARN]: clusterArn,
      [SemanticResourceAttributes.AWS_ECS_LAUNCHTYPE]:
        launchType?.toLowerCase(),
      [SemanticResourceAttributes.AWS_ECS_TASK_ARN]: taskArn,
      [SemanticResourceAttributes.AWS_ECS_TASK_FAMILY]: taskMetadata['Family'],
      [SemanticResourceAttributes.AWS_ECS_TASK_REVISION]:
        taskMetadata['Revision'],
    });
  }

  private static async _getLogResource(
    containerMetadata: any
  ): Promise<Resource> {
    if (
      containerMetadata['LogDriver'] !== 'awslogs' ||
      !containerMetadata['LogOptions']
    ) {
      return Resource.EMPTY;
    }

    const containerArn = containerMetadata['ContainerARN']!;
    const logOptions = containerMetadata['LogOptions'] as AwsLogOptions;

    const logsRegion =
      logOptions['awslogs-region'] ||
      AwsEcsDetector._getRegionFromArn(containerArn);

    const awsAccount = AwsEcsDetector._getAccountFromArn(containerArn);

    const logsGroupName = logOptions['awslogs-group']!;
    const logsGroupArn = `arn:aws:logs:${logsRegion}:${awsAccount}:log-group:${logsGroupName}`;
    const logsStreamName = logOptions['awslogs-stream']!;
    const logsStreamArn = `arn:aws:logs:${logsRegion}:${awsAccount}:log-group:${logsGroupName}:log-stream:${logsStreamName}`;

    return new Resource({
      [SemanticResourceAttributes.AWS_LOG_GROUP_NAMES]: [logsGroupName],
      [SemanticResourceAttributes.AWS_LOG_GROUP_ARNS]: [logsGroupArn],
      [SemanticResourceAttributes.AWS_LOG_STREAM_NAMES]: [logsStreamName],
      [SemanticResourceAttributes.AWS_LOG_STREAM_ARNS]: [logsStreamArn],
    });
  }

  private static _getAccountFromArn(containerArn: string): string {
    const match = /arn:aws:ecs:[^:]+:([^:]+):.*/.exec(containerArn);
    return match![1];
  }

  private static _getRegionFromArn(containerArn: string): string {
    const match = /arn:aws:ecs:([^:]+):.*/.exec(containerArn);
    return match![1];
  }

  private static _getUrlAsJson(url: string): Promise<any> {
    return new Promise<string>((resolve, reject) => {
      const request = http.get(url, (response: http.IncomingMessage) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(
            new Error(
              `Request to '${url}' failed with status ${response.statusCode}`
            )
          );
        }
        /*
         * Concatenate the response out of chunks:
         * https://nodejs.org/api/stream.html#stream_event_data
         */
        let responseBody = '';
        response.on(
          'data',
          (chunk: Buffer) => (responseBody += chunk.toString())
        );
        // All the data has been read, resolve the Promise
        response.on('end', () => resolve(responseBody));
        /*
         * https://nodejs.org/api/http.html#httprequesturl-options-callback, see the
         * 'In the case of a premature connection close after the response is received'
         * case
         */
        request.on('error', reject);
      });

      // Set an aggressive timeout to prevent lock-ups
      request.setTimeout(HTTP_TIMEOUT_IN_MS, () => {
        request.destroy();
      });
      // Connection error, disconnection, etc.
      request.on('error', reject);
      request.end();
    }).then(responseBodyRaw => JSON.parse(responseBodyRaw));
  }
}

export const awsEcsDetector = new AwsEcsDetector();
