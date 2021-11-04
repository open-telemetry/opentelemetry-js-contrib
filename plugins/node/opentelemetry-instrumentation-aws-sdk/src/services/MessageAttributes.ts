import { TextMapGetter, TextMapSetter, context, propagation, diag } from "@opentelemetry/api";
import { SQS,SNS } from "aws-sdk";

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
export const MAX_MESSAGE_ATTRIBUTES = 10;
class ContextSetter implements TextMapSetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap> {
    set(carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap, key: string, value: string) {
        carrier[key] = {
            DataType: 'String',
            StringValue: value as string,
        };
    }
}
export  const contextSetter = new ContextSetter();

class ContextGetter implements TextMapGetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap> {
    keys(carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap): string[] {
        return Object.keys(carrier);
    }

    get(carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap, key: string): undefined | string | string[] {
        return carrier?.[key]?.StringValue;
    }
}
export const contextGetter = new ContextGetter();

 
export const InjectPropagationContext = (attributesMap?: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap): SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap => {
    const attributes = attributesMap ?? {};
    if (Object.keys(attributes).length < MAX_MESSAGE_ATTRIBUTES) {
        propagation.inject(context.active(), attributes, contextSetter);
    } else {
        diag.warn(
            'aws-sdk instrumentation: cannot set context propagation on SQS/SNS message due to maximum amount of MessageAttributes'
        );
    }
    return attributes;
}

