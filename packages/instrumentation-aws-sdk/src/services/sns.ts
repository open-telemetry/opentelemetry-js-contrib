/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Span, Tracer, SpanKind, Attributes } from '@opentelemetry/api';
import {
  ATTR_AWS_SNS_TOPIC_ARN,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_SYSTEM,
} from '../semconv';
import {
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
} from '../semconv-obsolete';
import {
  NormalizedRequest,
  NormalizedResponse,
  AwsSdkInstrumentationConfig,
} from '../types';
import { injectPropagationContext } from './MessageAttributes';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';

const PHONE_NUMBER_DESTINATION = 'phone_number';
const PHONE_NUMBER_VISIBLE_CHARACTERS = 3;
const PHONE_NUMBER_MASK = '******';
const MINIMUM_MASKED_PHONE_NUMBER_LENGTH = 10;

function maskPhoneNumber(phoneNumber: unknown): string {
  const normalizedPhoneNumber = String(phoneNumber);
  if (normalizedPhoneNumber.length < MINIMUM_MASKED_PHONE_NUMBER_LENGTH) {
    return PHONE_NUMBER_MASK;
  }

  return `${normalizedPhoneNumber.slice(
    0,
    PHONE_NUMBER_VISIBLE_CHARACTERS
  )}${PHONE_NUMBER_MASK}${normalizedPhoneNumber.slice(
    -PHONE_NUMBER_VISIBLE_CHARACTERS
  )}`;
}

export class SnsServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig
  ): RequestMetadata {
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName = `SNS ${request.commandName}`;
    const spanAttributes: Attributes = {
      [ATTR_MESSAGING_SYSTEM]: 'aws.sns',
    };

    if (request.commandName === 'Publish') {
      spanKind = SpanKind.PRODUCER;

      spanAttributes[ATTR_MESSAGING_DESTINATION_KIND] =
        MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      const destinationName = this.extractDestinationName(
        TopicArn,
        TargetArn,
        PhoneNumber,
        config.snsCaptureFullPhoneNumber === true
      );
      spanAttributes[ATTR_MESSAGING_DESTINATION] = destinationName;
      spanAttributes[ATTR_MESSAGING_DESTINATION_NAME] =
        TopicArn || TargetArn || destinationName;

      spanName = `${
        PhoneNumber ? PHONE_NUMBER_DESTINATION : destinationName
      } send`;
    }

    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[ATTR_AWS_SNS_TOPIC_ARN] = topicArn;
    }

    return {
      isIncoming: false,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook(request: NormalizedRequest): void {
    if (request.commandName === 'Publish') {
      const origMessageAttributes =
        request.commandInput['MessageAttributes'] ?? {};
      if (origMessageAttributes) {
        request.commandInput['MessageAttributes'] = injectPropagationContext(
          origMessageAttributes
        );
      }
    }
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ): void {
    const topicArn = response.data?.TopicArn;
    if (topicArn) {
      span.setAttribute(ATTR_AWS_SNS_TOPIC_ARN, topicArn);
    }
  }

  extractDestinationName(
    topicArn: string,
    targetArn: string,
    phoneNumber: unknown,
    captureFullPhoneNumber: boolean
  ): string {
    if (topicArn || targetArn) {
      const arn = topicArn ?? targetArn;
      try {
        return arn.substring(arn.lastIndexOf(':') + 1);
      } catch (err) {
        return arn;
      }
    } else if (phoneNumber) {
      const normalizedPhoneNumber = String(phoneNumber);
      return captureFullPhoneNumber
        ? normalizedPhoneNumber
        : maskPhoneNumber(normalizedPhoneNumber);
    } else {
      return 'unknown';
    }
  }
}
