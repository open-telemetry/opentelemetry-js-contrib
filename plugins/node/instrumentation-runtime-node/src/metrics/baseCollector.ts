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
import { MetricCollector } from '../types/metricCollector';
import { Meter } from '@opentelemetry/api';
import { RuntimeNodeInstrumentationConfig } from '../types';


export abstract class BaseCollector implements MetricCollector {
  protected _config: RuntimeNodeInstrumentationConfig = {};

  protected namePrefix: string;

  protected constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    this._config = config;
    this.namePrefix = namePrefix;
  }

  public disable(): void {
    this._config.enabled = false;
    this.internalDisable();
  }

  public enable(): void {
    this._config.enabled = true;
    this.internalEnable();
  }


  public abstract updateMetricInstruments(meter: Meter): void;

  protected abstract internalEnable(): void;

  protected abstract internalDisable(): void;
}
