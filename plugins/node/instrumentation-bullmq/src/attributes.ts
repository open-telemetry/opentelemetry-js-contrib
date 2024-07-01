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
  SEMATTRS_MESSAGING_CONSUMER_ID,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_MESSAGE_ID,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
} from '@opentelemetry/semantic-conventions';

const ns = 'messaging.bullmq';
const job = `${ns}.job`;
const worker = `${ns}.worker`;

export const BullMQAttributes = {
  MESSAGING_SYSTEM: 'bullmq',
  MESSAGING_OPERATION_NAME: `${ns}.operation.name`,
  JOB_ATTEMPTS: `${job}.attempts`,
  JOB_DELAY: `${job}.delay`,
  JOB_FAILED_REASON: `${job}.failedReason`,
  JOB_FINISHED_TIMESTAMP: `${job}.finishedOn`,
  JOB_PROCESSED_TIMESTAMP: `${job}.processedOn`,
  JOB_NAME: `${job}.name`,
  JOB_OPTS: `${job}.opts`,
  JOB_REPEAT_KEY: `${job}.repeatJobKey`,
  JOB_TIMESTAMP: `${job}.timestamp`,
  JOB_PARENT_KEY: `${job}.parentOpts.parentKey`,
  JOB_WAIT_CHILDREN_KEY: `${job}.parentOpts.waitChildrenKey`,
  JOB_BULK_NAMES: `${job}.bulk.names`,
  JOB_BULK_COUNT: `${job}.bulk.count`,
  WORKER_CONCURRENCY: `${worker}.concurrency`,
  WORKER_LOCK_DURATION: `${worker}.lockDuration`,
  WORKER_LOCK_RENEW: `${worker}.lockRenewTime`,
  WORKER_RATE_LIMIT_MAX: `${worker}.rateLimiter.max`,
  WORKER_RATE_LIMIT_DURATION: `${worker}.rateLimiter.duration`,
  WORKER_RATE_LIMIT_GROUP: `${worker}.rateLimiter.groupKey`,
};

export const SemanticAttributes = {
  MESSAGING_SYSTEM: SEMATTRS_MESSAGING_SYSTEM,
  MESSAGING_DESTINATION: SEMATTRS_MESSAGING_DESTINATION,
  MESSAGING_OPERATION: SEMATTRS_MESSAGING_OPERATION,
  MESSAGING_MESSAGE_ID: SEMATTRS_MESSAGING_MESSAGE_ID,
  MESSAGING_CONSUMER_ID: SEMATTRS_MESSAGING_CONSUMER_ID,
};
