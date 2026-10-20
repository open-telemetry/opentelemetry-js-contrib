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

// A raw phone number is personally identifiable information and must never be
// recorded as a span attribute or span name. SMS `SNS.publish` calls use this
// low-cardinality placeholder in place of the real number.
const PHONE_NUMBER_DESTINATION = 'phone_number';

export class SnsServiceExtension implements ServiceExtension {
  requestPreSpanHook(
    request: NormalizedRequest,
    _config: AwsSdkInstrumentationConfig
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
      spanAttributes[ATTR_MESSAGING_DESTINATION] = this.extractDestinationName(
        TopicArn,
        TargetArn,
        PhoneNumber
      );
      // Use the full ARN as the destination name when available. A phone-number
      // destination is redacted to the low-cardinality placeholder; the raw
      // number is PII and must never be recorded. Both destination attributes
      // share the same redaction decision (see redactPhoneNumberDestination) so
      // they can never drift and leak the real number from one of them.
      spanAttributes[ATTR_MESSAGING_DESTINATION_NAME] =
        TopicArn || TargetArn || this.redactPhoneNumberDestination(PhoneNumber);

      spanName = `${spanAttributes[ATTR_MESSAGING_DESTINATION]} send`;
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
    phoneNumber: string
  ): string {
    if (topicArn || targetArn) {
      const arn = topicArn || targetArn;
      try {
        return arn.substring(arn.lastIndexOf(':') + 1);
      } catch (err) {
        return arn;
      }
    } else if (phoneNumber) {
      // Redact the phone number (PII); never return the raw value.
      return this.redactPhoneNumberDestination(phoneNumber);
    } else {
      return 'unknown';
    }
  }

  // Single source of truth for how a (possibly phone-number) SNS destination is
  // represented as a span attribute. A raw phone number is PII and is replaced
  // by the low-cardinality placeholder; a missing destination is 'unknown'.
  // Keeping this decision in one place ensures every destination attribute
  // redacts identically and the real number cannot leak from any of them.
  private redactPhoneNumberDestination(phoneNumber: string): string {
    return phoneNumber ? PHONE_NUMBER_DESTINATION : 'unknown';
  }
}
