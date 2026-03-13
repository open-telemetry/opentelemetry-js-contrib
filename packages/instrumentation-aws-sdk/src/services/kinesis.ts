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
  Attributes,
  SpanKind,
  context,
  propagation,
  diag,
} from '@opentelemetry/api';
import { AttributeNames } from '../enums';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_SYSTEM,
} from '../semconv';
import { AwsSdkInstrumentationConfig, NormalizedRequest } from '../types';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class KinesisServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    const streamName = this.extractStreamName(request.commandInput);
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const spanAttributes: Attributes = {};

    if (streamName) {
      spanAttributes[AttributeNames.AWS_KINESIS_STREAM_NAME] = streamName;
    }

    switch (request.commandName) {
      case 'PutRecord':
      case 'PutRecords':
        spanKind = SpanKind.PRODUCER;
        spanName = `${streamName ?? 'unknown'} send`;
        spanAttributes[ATTR_MESSAGING_SYSTEM] = 'aws_kinesis';
        if (streamName) {
          spanAttributes[ATTR_MESSAGING_DESTINATION_NAME] = streamName;
        }
        break;
    }

    const isIncoming = false;

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook = (request: NormalizedRequest): void => {
    switch (request.commandName) {
      case 'PutRecord':
        this.injectSpanContextIntoKinesisRecord(request.commandInput);
        break;
      case 'PutRecords':
        {
          const records = request.commandInput?.Records;
          if (Array.isArray(records)) {
            records.forEach((record: Record<string, unknown>) => {
              this.injectSpanContextIntoKinesisRecord(record);
            });
          }
        }
        break;
    }
  };

  private injectSpanContextIntoKinesisRecord(
    entry: Record<string, unknown>
  ): void {
    const data = entry?.Data;
    if (data == null) return;

    try {
      let dataString: string;
      let isBuffer = false;

      if (typeof data === 'string') {
        dataString = data;
      } else if (data instanceof Uint8Array) {
        isBuffer = true;
        dataString = new TextDecoder().decode(data);
      } else {
        return;
      }

      const parsed = JSON.parse(dataString);
      propagation.inject(context.active(), parsed);
      const injected = JSON.stringify(parsed);

      entry.Data = isBuffer ? new TextEncoder().encode(injected) : injected;
    } catch {
      diag.debug(
        'aws-sdk instrumentation: Failed to inject context into Kinesis record Data, data is not valid JSON.'
      );
    }
  }

  private extractStreamName(
    commandInput: Record<string, unknown>
  ): string | undefined {
    if (commandInput?.StreamName) {
      return commandInput.StreamName as string;
    }
    const streamArn = commandInput?.StreamARN as string | undefined;
    if (streamArn) {
      // ARN format: arn:aws:kinesis:<region>:<account>:stream/<stream-name>
      const streamPrefix = 'stream/';
      const idx = streamArn.lastIndexOf(streamPrefix);
      if (idx >= 0) {
        return streamArn.substring(idx + streamPrefix.length);
      }
    }
    return undefined;
  }
}
