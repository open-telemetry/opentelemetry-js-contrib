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
import { clearInterval } from 'node:timers';
import { RuntimeNodeInstrumentationConfig } from '../types';
import { NODE_JS_VERSION_ATTRIBUTE } from '../consts/attributes';

type VersionAttribute = { [NODE_JS_VERSION_ATTRIBUTE]: string };

export abstract class BaseCollector<T> implements MetricCollector {
  protected _config: RuntimeNodeInstrumentationConfig = {};

  protected namePrefix: string;
  private _interval: NodeJS.Timeout | undefined;
  protected _scrapeQueue: T[] = [];
  protected versionAttribute: VersionAttribute;

  protected constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    this._config = config;
    this.namePrefix = namePrefix;
    this.versionAttribute = { [NODE_JS_VERSION_ATTRIBUTE]: process.version };
  }

  public disable(): void {
    this._clearQueue();
    clearInterval(this._interval);
    this._interval = undefined;

    this.internalDisable();
  }

  public enable(): void {
    this._clearQueue();
    clearInterval(this._interval);
    this._interval = setInterval(
      () => this._addTask(),
      this._config.monitoringPrecision
    );

    // unref so that it does not keep the process running if disable() is never called
    this._interval?.unref();

    this.internalEnable();
  }

  private _clearQueue() {
    this._scrapeQueue.length = 0;
  }

  private _addTask() {
    const taskResult = this.scrape();
    if (taskResult) {
      this._scrapeQueue.push(taskResult);
    }
  }

  public abstract updateMetricInstruments(meter: Meter): void;

  protected abstract internalEnable(): void;

  protected abstract internalDisable(): void;

  protected abstract scrape(): T;
}
