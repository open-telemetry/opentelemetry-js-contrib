import {InstrumentationConfig} from '@opentelemetry/instrumentation';
export interface PulsarInstrumentationConfig extends InstrumentationConfig {
  trackBeforeAndAfterConsume?: boolean;
}
