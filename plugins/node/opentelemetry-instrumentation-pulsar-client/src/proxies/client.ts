import * as Pulsar from "pulsar-client";
import * as api from "@opentelemetry/api";
import {ProducerProxy} from "./producer";
import {ConsumerProxy} from "./consumer";

export class ClientProxy implements Pulsar.Client {
  private _client: Pulsar.Client;
  private _tracer: api.Tracer;
  private _moduleVersion: undefined | string;

  constructor(
    tracer: api.Tracer,
    moduleVersion: undefined | string,
    client: Pulsar.Client
  ) {
    this._tracer = tracer;
    this._moduleVersion = moduleVersion;
    this._client = client;
  }

  createReader(config: Pulsar.ReaderConfig): Promise<Pulsar.Reader> {
    throw new Error('Method not implemented.');
  }

  async createProducer(
    config: Pulsar.ProducerConfig
  ): Promise<Pulsar.Producer> {
    const producer = await this._client.createProducer(config);
    return new ProducerProxy(
      this._tracer,
      this._moduleVersion,
      config,
      producer
    );
  }

  async subscribe(config: Pulsar.ConsumerConfig): Promise<Pulsar.Consumer> {
    const consumer = await this._client.subscribe(config);
    return new ConsumerProxy(
      this._tracer,
      this._moduleVersion,
      config,
      consumer
    );
  }

  // createReader(config: Pulsar.ReaderConfig): Promise<Pulsar.Reader>;
  close(): Promise<null> {
    return this._client.close();
  }
}
