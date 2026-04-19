/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ResourceDetector,
  DetectedResource,
  DetectedResourceAttributes,
} from '@opentelemetry/resources';
import * as http from 'http';
import {
  ATTR_AWS_LOG_GROUP_NAMES,
  ATTR_CLOUD_AVAILABILITY_ZONE,
  ATTR_CLOUD_PLATFORM,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_REGION,
  ATTR_FAAS_INSTANCE,
  ATTR_FAAS_NAME,
  ATTR_FAAS_MAX_MEMORY,
  ATTR_FAAS_VERSION,
  CLOUD_PROVIDER_VALUE_AWS,
  CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
} from '../semconv';

interface LambdaExecutionEnvironmentMetadata {
  readonly AvailabilityZoneID?: string;
}

/**
 * The AwsLambdaDetector can be used to detect if a process is running in AWS Lambda
 * and return a {@link Resource} populated with data about the environment.
 * Returns an empty Resource if detection fails.
 */
export class AwsLambdaDetector implements ResourceDetector {
  public readonly AWS_LAMBDA_EXECUTION_ENVIRONMENT_METADATA_PATH =
    '/2026-01-15/metadata/execution-environment';
  public readonly AWS_LAMBDA_METADATA_AUTH_HEADER = 'Authorization';
  public readonly MILLISECOND_TIME_OUT = 1000;

  public detect(): DetectedResource {
    // Check if running inside AWS Lambda environment
    const executionEnv = process.env.AWS_EXECUTION_ENV;
    if (!executionEnv?.startsWith('AWS_Lambda_')) {
      return {};
    }

    // These environment variables are guaranteed to be present in Lambda environment
    // https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime
    const region = process.env.AWS_REGION;
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    const functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const memorySize = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

    // These environment variables are not available in Lambda SnapStart functions
    const logGroupName = process.env.AWS_LAMBDA_LOG_GROUP_NAME;
    const logStreamName = process.env.AWS_LAMBDA_LOG_STREAM_NAME;

    const attributes: DetectedResourceAttributes = {
      [ATTR_CLOUD_PROVIDER]: CLOUD_PROVIDER_VALUE_AWS,
      [ATTR_CLOUD_PLATFORM]: CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
      [ATTR_CLOUD_REGION]: region,
      [ATTR_FAAS_NAME]: functionName,
      [ATTR_FAAS_VERSION]: functionVersion,
      [ATTR_FAAS_MAX_MEMORY]: parseInt(memorySize!) * 1024 * 1024,
    };

    if (logGroupName) {
      attributes[ATTR_AWS_LOG_GROUP_NAMES] = [logGroupName];
    }
    if (logStreamName) {
      attributes[ATTR_FAAS_INSTANCE] = logStreamName;
    }

    const metadataApi = process.env.AWS_LAMBDA_METADATA_API;
    const metadataToken = process.env.AWS_LAMBDA_METADATA_TOKEN;
    if (metadataApi && metadataToken) {
      attributes[ATTR_CLOUD_AVAILABILITY_ZONE] = context.with(
        suppressTracing(context.active()),
        () => this._fetchAvailabilityZone(metadataApi, metadataToken)
      );
    }

    return { attributes };
  }

  private async _fetchAvailabilityZone(
    metadataApi: string,
    metadataToken: string
  ): Promise<string | undefined> {
    try {
      const metadata = await this._fetchExecutionEnvironmentMetadata(
        metadataApi,
        metadataToken
      );
      return metadata.AvailabilityZoneID;
    } catch {
      return undefined;
    }
  }

  private async _fetchExecutionEnvironmentMetadata(
    metadataApi: string,
    metadataToken: string
  ): Promise<LambdaExecutionEnvironmentMetadata> {
    const url = new URL(
      `http://${metadataApi}${this.AWS_LAMBDA_EXECUTION_ENVIRONMENT_METADATA_PATH}`
    );
    const metadata = await this._fetchString(url, {
      method: 'GET',
      timeout: this.MILLISECOND_TIME_OUT,
      headers: {
        [this.AWS_LAMBDA_METADATA_AUTH_HEADER]: `Bearer ${metadataToken}`,
      },
    });

    return JSON.parse(metadata);
  }

  private async _fetchString(
    url: URL,
    options: http.RequestOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        req.abort();
        reject(new Error('Lambda metadata api request timed out.'));
      }, this.MILLISECOND_TIME_OUT);

      const req = http.request(url, options, res => {
        clearTimeout(timeoutId);
        const { statusCode } = res;
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => {
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            resolve(rawData);
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

export const awsLambdaDetector = new AwsLambdaDetector();
