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
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { RedisInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { RedisInstrumentationV2_V3 } from './v2-v3/instrumentation';
import { TracerProvider } from '@opentelemetry/api';
import { RedisInstrumentationV4 } from './v4/instrumentation';

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
  requireParentSpan: false,
};

// Wrapper RedisInstrumentation that address all supported versions
export class RedisInstrumentation extends InstrumentationBase<RedisInstrumentationConfig> {
  private instrumentationV2_V3: RedisInstrumentationV2_V3;
  private instrumentationV4: RedisInstrumentationV4;

  // this is used to bypass a flaw in the base class constructor, which is calling
  // member functions before the constructor has a chance to fully initialize the member variables.
  private initialized = false;

  constructor(config: RedisInstrumentationConfig = {}) {
    const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
    super(PACKAGE_NAME, PACKAGE_VERSION, resolvedConfig);

    this.instrumentationV2_V3 = new RedisInstrumentationV2_V3(this.getConfig());
    this.instrumentationV4 = new RedisInstrumentationV4(this.getConfig());
    this.initialized = true;
  }

  override setConfig(config: RedisInstrumentationConfig = {}) {
    const newConfig = { ...DEFAULT_CONFIG, ...config };
    super.setConfig(newConfig);
    if (!this.initialized) {
      return;
    }

    this.instrumentationV2_V3.setConfig(newConfig);
    this.instrumentationV4.setConfig(newConfig);
  }

  override init() {}

  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.setTracerProvider(tracerProvider);
    this.instrumentationV4.setTracerProvider(tracerProvider);
  }

  override enable() {
    super.enable();
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.enable();
    this.instrumentationV4.enable();
  }

  override disable() {
    super.disable();
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.disable();
    this.instrumentationV4.disable();
  }
}
