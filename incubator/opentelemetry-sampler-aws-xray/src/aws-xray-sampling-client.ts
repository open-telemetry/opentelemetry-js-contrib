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

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DiagLogFunction, DiagLogger, context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import * as http from 'http';
import {
  GetSamplingRulesResponse,
  GetSamplingTargetsBody,
  GetSamplingTargetsResponse,
} from './types';

export class AWSXRaySamplingClient {
  private getSamplingRulesEndpoint: string;
  private samplingTargetsEndpoint: string;
  private samplerDiag: DiagLogger;

  constructor(endpoint: string, samplerDiag: DiagLogger) {
    this.getSamplingRulesEndpoint = endpoint + '/GetSamplingRules';
    this.samplingTargetsEndpoint = endpoint + '/SamplingTargets';
    this.samplerDiag = samplerDiag;
  }

  public fetchSamplingTargets(
    requestBody: GetSamplingTargetsBody,
    callback: (responseObject: GetSamplingTargetsResponse) => void
  ) {
    this.makeSamplingRequest<GetSamplingTargetsResponse>(
      this.samplingTargetsEndpoint,
      callback,
      (message: string) => this.samplerDiag.debug(message),
      JSON.stringify(requestBody)
    );
  }

  public fetchSamplingRules(
    callback: (responseObject: GetSamplingRulesResponse) => void
  ) {
    this.makeSamplingRequest<GetSamplingRulesResponse>(
      this.getSamplingRulesEndpoint,
      callback,
      (message: string) => this.samplerDiag.error(message)
    );
  }

  private makeSamplingRequest<T>(
    url: string,
    callback: (responseObject: T) => void,
    logger: DiagLogFunction,
    requestBodyJsonString?: string
  ): void {
    const options: http.RequestOptions = {
      method: 'POST',
      headers: {},
    };

    if (requestBodyJsonString) {
      options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBodyJsonString),
      };
    }

    // Ensure AWS X-Ray Sampler does not generate traces itself
    context.with(suppressTracing(context.active()), () => {
      const req: http.ClientRequest = http
        .request(url, options, response => {
          response.setEncoding('utf-8');
          let responseData = '';
          response.on('data', dataChunk => (responseData += dataChunk));
          response.on('end', () => {
            if (response.statusCode === 200 && responseData.length > 0) {
              let responseObject: T | undefined = undefined;
              try {
                responseObject = JSON.parse(responseData) as T;
              } catch (e: unknown) {
                logger(`Error occurred when parsing responseData from ${url}`);
              }

              if (responseObject) {
                callback(responseObject);
              }
            } else {
              this.samplerDiag.debug(
                `${url} Response Code is: ${response.statusCode}`
              );
              this.samplerDiag.debug(`${url} responseData is: ${responseData}`);
            }
          });
        })
        .on('error', (error: unknown) => {
          logger(`Error occurred when making an HTTP POST to ${url}: ${error}`);
        });
      if (requestBodyJsonString) {
        req.end(requestBodyJsonString);
      } else {
        req.end();
      }
    });
  }
}
