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
  ResourceDetector,
  DetectedResource,
  DetectedResourceAttributes,
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
export class AwsEcsDetector implements ResourceDetector {
  static readonly CONTAINER_ID_LENGTH = 64;
  static readonly DEFAULT_CGROUP_PATH = '/proc/self/cgroup';

  private static readFileAsync = util.promisify(fs.readFile);

  detect(): DetectedResource {
    const attributes = context.with(suppressTracing(context.active()), () =>
      this._getAttributes()
    );
    return { attributes };
  }

  private _getAttributes(): DetectedResourceAttributes {
    if (
      !process.env.ECS_CONTAINER_METADATA_URI_V4 &&
      !process.env.ECS_CONTAINER_METADATA_URI
    ) {
      diag.debug('AwsEcsDetector: Process is not on ECS');
      return {};
    }

    const dataPromise = this._gatherData();

    const attrNames = [
      ATTR_CLOUD_PROVIDER,
      ATTR_CLOUD_PLATFORM,
      ATTR_CONTAINER_NAME,
      ATTR_CONTAINER_ID,

      // Added in _addMetadataV4Attrs
      ATTR_AWS_ECS_CONTAINER_ARN,
      ATTR_AWS_ECS_CLUSTER_ARN,
      ATTR_AWS_ECS_LAUNCHTYPE,
      ATTR_AWS_ECS_TASK_ARN,
      ATTR_AWS_ECS_TASK_FAMILY,
      ATTR_AWS_ECS_TASK_REVISION,
      ATTR_CLOUD_ACCOUNT_ID,
      ATTR_CLOUD_REGION,
      ATTR_CLOUD_RESOURCE_ID,
      ATTR_CLOUD_AVAILABILITY_ZONE,

      // Added in _addLogAttrs
      ATTR_AWS_LOG_GROUP_NAMES,
      ATTR_AWS_LOG_GROUP_ARNS,
      ATTR_AWS_LOG_STREAM_NAMES,
      ATTR_AWS_LOG_STREAM_ARNS,
    ];

    const attributes = {} as DetectedResourceAttributes;
    attrNames.forEach(name => {
      // Each resource attribute is determined asynchronously in _gatherData().
      attributes[name] = dataPromise.then(data => data[name]);
    });
    return attributes;
  }

  private async _gatherData(): Promise<DetectedResourceAttributes> {
    try {
      const data = {
        [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AWS,
        [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AWS_ECS,
        [ATTR_CONTAINER_NAME]: os.hostname(),
        [ATTR_CONTAINER_ID]: await this._getContainerId(),
      };

      const metadataUrl = process.env.ECS_CONTAINER_METADATA_URI_V4;
      if (metadataUrl) {
        const [containerMetadata, taskMetadata] = await Promise.all([
          AwsEcsDetector._getUrlAsJson(metadataUrl),
          AwsEcsDetector._getUrlAsJson(`${metadataUrl}/task`),
        ]);

        AwsEcsDetector._addMetadataV4Attrs(
          data,
          containerMetadata,
          taskMetadata
        );
        AwsEcsDetector._addLogAttrs(data, containerMetadata);
      }
      return data;
    } catch {
      return {};
    }
  }

  /**
   * Read container ID from cgroup file
   * In ECS, even if we fail to find target file
   * or target file does not contain container ID
   * we do not throw an error but throw warning message
   * and then return undefined.
   */
  private async _getContainerId(): Promise<string | undefined> {
    let containerId = undefined;
    try {
      const rawData = await AwsEcsDetector.readFileAsync(
        AwsEcsDetector.DEFAULT_CGROUP_PATH,
        'utf8'
      );
      const splitData = rawData.trim().split('\n');
      for (const str of splitData) {
        containerId = this._extractContainerIdFromLine(str);
        if (containerId) {
          break;
        }
      }
    } catch (e) {
      diag.debug('AwsEcsDetector failed to read container ID', e);
    }
    return containerId;
  }

  /**
   * Extract container ID from a cgroup line.
   * Handles the new AWS ECS Fargate format: /ecs/<taskId>/<taskId>-<containerId>
   * Returns the last segment after the final '/' which should be the complete container ID.
   */
  private _extractContainerIdFromLine(line: string): string | undefined {
    if (!line) {
      return undefined;
    }

    // Split by '/' and get the last segment
    const segments = line.split('/');
    if (segments.length <= 1) {
      // Fallback to original logic if no '/' found
      if (line.length > AwsEcsDetector.CONTAINER_ID_LENGTH) {
        return line.substring(line.length - AwsEcsDetector.CONTAINER_ID_LENGTH);
      }
      return undefined;
    }

    let lastSegment = segments[segments.length - 1];
    
    // Handle containerd v1.5.0+ format with systemd cgroup driver (e.g., ending with :cri-containerd:containerid)
    const colonIndex = lastSegment.lastIndexOf(':');
    if (colonIndex !== -1) {
      lastSegment = lastSegment.substring(colonIndex + 1);
    }

    // Remove known prefixes if they exist
    const prefixes = ['docker-', 'crio-', 'cri-containerd-'];
    for (const prefix of prefixes) {
      if (lastSegment.startsWith(prefix)) {
        lastSegment = lastSegment.substring(prefix.length);
        break;
      }
    }

    // Remove anything after the first period (like .scope)
    if (lastSegment.includes('.')) {
      lastSegment = lastSegment.split('.')[0];
    }

    // Basic validation: should not be empty and should have reasonable length
    if (!lastSegment || lastSegment.length < 8) {
      return undefined;
    }

    // AWS ECS container IDs can be in various formats:
    // 1. Pure hex strings: 'abcdef123456'
    // 2. ECS format: 'taskId-containerId' 
    // 3. Mixed alphanumeric with hyphens
    // We'll be more permissive and allow alphanumeric characters and hyphens
    const containerIdPattern = /^[a-zA-Z0-9\-_]+$/;
    
    if (containerIdPattern.test(lastSegment)) {
      return lastSegment;
    }

    // If the pattern doesn't match but the segment looks reasonable,
    // still try to return it (last resort for edge cases)
    if (lastSegment.length >= 12 && lastSegment.length <= 128) {
      diag.debug(`AwsEcsDetector: Using container ID with non-standard format: ${lastSegment}`);
      return lastSegment;
    }

    return undefined;
  }

  /**
   * Add metadata-v4-related resource attributes to `data` (in-place)
   */
  private static _addMetadataV4Attrs(
    data: DetectedResourceAttributes,
    containerMetadata: any,
    taskMetadata: any
  ) {
    const launchType: string = taskMetadata['LaunchType'];
    const taskArn: string = taskMetadata['TaskARN'];

    const baseArn: string = taskArn.substring(0, taskArn.lastIndexOf(':'));
    const cluster: string = taskMetadata['Cluster'];

    const accountId: string = AwsEcsDetector._getAccountFromArn(taskArn);
    const region: string = AwsEcsDetector._getRegionFromArn(taskArn);
    const availabilityZone: string | undefined = taskMetadata?.AvailabilityZone;

    const clusterArn = cluster.startsWith('arn:')
      ? cluster
      : `${baseArn}:cluster/${cluster}`;

    const containerArn: string = containerMetadata['ContainerARN'];

    // https://github.com/open-telemetry/semantic-conventions/blob/main/semantic_conventions/resource/cloud_provider/aws/ecs.yaml
    data[ATTR_AWS_ECS_CONTAINER_ARN] = containerArn;
    data[ATTR_AWS_ECS_CLUSTER_ARN] = clusterArn;
    data[ATTR_AWS_ECS_LAUNCHTYPE] = launchType?.toLowerCase();
    data[ATTR_AWS_ECS_TASK_ARN] = taskArn;
    data[ATTR_AWS_ECS_TASK_FAMILY] = taskMetadata['Family'];
    data[ATTR_AWS_ECS_TASK_REVISION] = taskMetadata['Revision'];

    data[ATTR_CLOUD_ACCOUNT_ID] = accountId;
    data[ATTR_CLOUD_REGION] = region;
    data[ATTR_CLOUD_RESOURCE_ID] = containerArn;

    // The availability zone is not available in all Fargate runtimes
    if (availabilityZone) {
      data[ATTR_CLOUD_AVAILABILITY_ZONE] = availabilityZone;
    }
  }

  private static _addLogAttrs(
    data: DetectedResourceAttributes,
    containerMetadata: any
  ) {
    if (
      containerMetadata['LogDriver'] !== 'awslogs' ||
      !containerMetadata['LogOptions']
    ) {
      return;
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

    data[ATTR_AWS_LOG_GROUP_NAMES] = [logsGroupName];
    data[ATTR_AWS_LOG_GROUP_ARNS] = [logsGroupArn];
    data[ATTR_AWS_LOG_STREAM_NAMES] = [logsStreamName];
    data[ATTR_AWS_LOG_STREAM_ARNS] = [logsStreamArn];
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
