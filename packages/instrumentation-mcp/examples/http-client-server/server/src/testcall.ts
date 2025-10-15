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

/**
 * External service call utilities
 * Demonstrates instrumentation of HTTP and AWS SDK calls
 */

import http from 'http';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

interface S3Response {
  success: boolean;
  buckets: string;
  error?: string;
}

/**
 * Make an AWS S3 API call to list buckets
 * Demonstrates AWS SDK instrumentation
 */
async function callS3(): Promise<S3Response> {
  try {
    const s3Client = new S3Client({});
    const command = new ListBucketsCommand({});
    const data = await s3Client.send(command);
    
    const buckets = data.Buckets?.map((bucket) => bucket.Name).join(', ') || 'No buckets found';
    
    return {
      success: true,
      buckets
    };
  } catch (error: unknown) {
    return {
      success: false,
      buckets: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Make an HTTP GET request to the specified URL
 * Demonstrates HTTP instrumentation
 */
function callHttp(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(`Status: ${response.statusCode}, Body length: ${data.length} bytes`);
      });
    });

    request.on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });

    // Set timeout
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('HTTP request timeout'));
    });
  });
}

/**
 * Public API: Make S3 call
 */
export async function makeS3Call(): Promise<string> {
  const result = await callS3();
  
  if (result.success) {
    return `S3 call succeeded. Buckets: ${result.buckets}`;
  } else {
    return `S3 call failed: ${result.error}`;
  }
}

/**
 * Public API: Make HTTP call
 */
export async function makeHttpCall(url: string): Promise<string> {
  try {
    const result = await callHttp(url);
    return `HTTP call succeeded. ${result}`;
  } catch (error: unknown) {
    return `HTTP call failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}