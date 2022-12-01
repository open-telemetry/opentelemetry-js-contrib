import * as Pulsar from "pulsar-client";
import * as api from "@opentelemetry/api";
import {Span, Tracer} from "@opentelemetry/api";
import {Instrumentation} from "../instrumentation";

export class ConsumerProxy implements Pulsar.Consumer {
  private _tracer: Tracer;
  private _moduleVersion: string | undefined;
  private config: Pulsar.ConsumerConfig;
  private consumer: Pulsar.Consumer;

  private _lastSpan: Span | undefined;

  constructor(
    _tracer: Tracer,
    _moduleVersion: string | undefined,
    config: Pulsar.ConsumerConfig,
    consumer: Pulsar.Consumer
  ) {
    this._tracer = _tracer;
    this._moduleVersion = _moduleVersion;
    this.config = config;
    this.consumer = consumer;
  }

  async receive(timeout?: number): Promise<Pulsar.Message> {
    this.closePreviousSpan();
    const message = await this.consumer.receive(timeout);

    const remoteContext = api.propagation.extract(
      api.context.active(),
      message.getProperties()
    );
    const span = this._tracer.startSpan(
      'receive',
      {
        kind: api.SpanKind.CONSUMER,
        attributes: {
          'pulsar.version': this._moduleVersion,
          topic: this.config.topic,
          ...Instrumentation.COMMON_ATTRIBUTES,
        },
      },
      remoteContext
    );

    api.trace.setSpan(remoteContext, span);

    // Postpone the span ending for the next time the user calls receive
    this._lastSpan = span;
    return message;
  }

  private closePreviousSpan() {
    // User is done with the last message and called receive again.
    if (this._lastSpan) {
      this._lastSpan.end();
    }
  }

  acknowledge(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  acknowledgeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  negativeAcknowledge(message: Pulsar.Message): void {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  negativeAcknowledgeId(messageId: Pulsar.MessageId): void {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  acknowledgeCumulative(message: Pulsar.Message): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  acknowledgeCumulativeId(messageId: Pulsar.MessageId): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }

  isConnected(): boolean {
    throw new Error('Method not implemented.');
  }

  close(): Promise<null> {
    this.closePreviousSpan();
    return this.consumer.close();
  }

  unsubscribe(): Promise<null> {
    this.closePreviousSpan();
    throw new Error('Method not implemented.');
  }
}
