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

import { context, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  DetectorSync,
  IResource,
  Resource,
  ResourceAttributes,
} from '@opentelemetry/resources';
import {
  ATTR_AWS_ECS_CLUSTER_ARN,
  ATTR_AWS_ECS_CONTAINER_ARN,
  ATTR_AWS_ECS_LAUNCHTYPE,
  ATTR_AWS_ECS_TASK_ARN,
  ATTR_AWS_ECS_TASK_FAMILY,
  ATTR_AWS_ECS_TASK_REVISION,
  ATTR_AWS_LOG_GROUP_ARNS,
  ATTR_AWS_LOG_GROUP_NAMES,
  ATTR_AWS_LOG_STREAM_ARNS,
  ATTR_AWS_LOG_STREAM_NAMES,
  ATTR_CLOUD_ACCOUNT_ID,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_CLOUD_RESOURCE_ID,
  ATTR_CONTAINER_ID,
  ATTR_CONTAINER_NAME,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_ECS,
} from '../semconv';
import * as http from 'http';
import * as util from 'util';
import * as fs from 'fs';
import * as os from 'os';

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
export class AwsEcsDetectorSync implements DetectorSync {
  static readonly CONTAINER_ID_LENGTH = 64;
  static readonly DEFAULT_CGROUP_PATH = '/proc/self/cgroup';

  private static readFileAsync = util.promisify(fs.readFile);

  detect(): IResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return new Resource({}, attributes);
  }

  private async _getAttributes(): Promise<ResourceAttributes> {
    if (
      !process.env.ECS_CONTAINER_METADATA_URI_V4 &&
      !process.env.ECS_CONTAINER_METADATA_URI
    ) {
      diag.debug('AwsEcsDetector failed: Process is not on ECS');
      return {};
    }

    try {
      let resource = new Resource({
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AWS,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AWS_ECS,
      }).merge(await AwsEcsDetectorSync._getContainerIdAndHostnameResource());

      const metadataUrl = process.env.ECS_CONTAINER_METADATA_URI_V4;
      if (metadataUrl) {
        const [containerMetadata, taskMetadata] = await Promise.all([
          AwsEcsDetectorSync._getUrlAsJson(metadataUrl),
          AwsEcsDetectorSync._getUrlAsJson(`${metadataUrl}/task`),
        ]);

        const metadatav4Resource =
          await AwsEcsDetectorSync._getMetadataV4Resource(
            containerMetadata,
            taskMetadata
          );
        const logsResource = await AwsEcsDetectorSync._getLogResource(
          containerMetadata
        );

        resource = resource.merge(metadatav4Resource).merge(logsResource);
      }

      return resource.attributes;
    } catch {
      return {};
    }
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
      const rawData = await AwsEcsDetectorSync.readFileAsync(
        AwsEcsDetectorSync.DEFAULT_CGROUP_PATH,
        'utf8'
      );
      const splitData = rawData.trim().split('\n');
      for (const str of splitData) {
        if (str.length > AwsEcsDetectorSync.CONTAINER_ID_LENGTH) {
          containerId = str.substring(
            str.length - AwsEcsDetectorSync.CONTAINER_ID_LENGTH
          );
          break;
        }
      }
    } catch (e) {
      diag.debug('AwsEcsDetector failed to read container ID', e);
    }

    if (hostName || containerId) {
      return new Resource({
        [ATTR_CONTAINER_NAME]: hostName || '',
        [ATTR_CONTAINER_ID]: containerId || '',
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

    const accountId: string = AwsEcsDetectorSync._getAccountFromArn(taskArn);
    const region: string = AwsEcsDetectorSync._getRegionFromArn(taskArn);
    const availabilityZone: string | undefined = taskMetadata?.AvailabilityZone;

    const clusterArn = cluster.startsWith('arn:')
      ? cluster
      : `${baseArn}:cluster/${cluster}`;

    const containerArn: string = containerMetadata['ContainerARN'];

    // https://github.com/open-telemetry/semantic-conventions/blob/main/semantic_conventions/resource/cloud_provider/aws/ecs.yaml
    const attributes: ResourceAttributes = {
      [ATTR_AWS_ECS_CONTAINER_ARN]: containerArn,
      [ATTR_AWS_ECS_CLUSTER_ARN]: clusterArn,
      [ATTR_AWS_ECS_LAUNCHTYPE]: launchType?.toLowerCase(),
      [ATTR_AWS_ECS_TASK_ARN]: taskArn,
      [ATTR_AWS_ECS_TASK_FAMILY]: taskMetadata['Family'],
      [ATTR_AWS_ECS_TASK_REVISION]: taskMetadata['Revision'],

      [ATTR_CLOUD_ACCOUNT_ID]: accountId,
      [ATTR_CLOUD_REGION]: region,
      [ATTR_CLOUD_RESOURCE_ID]: containerArn,
    };

    // The availability zone is not available in all Fargate runtimes
    if (availabilityZone) {
      attributes[ATTR_CLOUD_AVAILABILITY_ZONE] = availabilityZone;
    }

    return new Resource(attributes);
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
      AwsEcsDetectorSync._getRegionFromArn(containerArn);

    const awsAccount = AwsEcsDetectorSync._getAccountFromArn(containerArn);

    const logsGroupName = logOptions['awslogs-group']!;
    const logsGroupArn = `arn:aws:logs:${logsRegion}:${awsAccount}:log-group:${logsGroupName}`;
    const logsStreamName = logOptions['awslogs-stream']!;
    const logsStreamArn = `arn:aws:logs:${logsRegion}:${awsAccount}:log-group:${logsGroupName}:log-stream:${logsStreamName}`;

    return new Resource({
      [ATTR_AWS_LOG_GROUP_NAMES]: [logsGroupName],
      [ATTR_AWS_LOG_GROUP_ARNS]: [logsGroupArn],
      [ATTR_AWS_LOG_STREAM_NAMES]: [logsStreamName],
      [ATTR_AWS_LOG_STREAM_ARNS]: [logsStreamArn],
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

export const awsEcsDetectorSync = new AwsEcsDetectorSync();
