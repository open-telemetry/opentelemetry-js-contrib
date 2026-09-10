/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// PerformanceLongAnimationFrameTiming is experimental and may change in future versions.
// https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming
/* eslint-disable baseline-js/use-baseline */

import { diag } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type {
  LongAnimationFrameInstrumentationConfig,
  PerformanceLongAnimationFrameTiming,
} from './types';

const LONG_ANIMATION_FRAME_PERFORMANCE_TYPE = 'long-animation-frame';

export class LongAnimationFrameInstrumentation extends InstrumentationBase<LongAnimationFrameInstrumentationConfig> {
  readonly version: string = PACKAGE_VERSION;

  private _observer?: PerformanceObserver;

  constructor(config: LongAnimationFrameInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init() {}

  private isSupported() {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes
    ) {
      return false;
    }

    return PerformanceObserver.supportedEntryTypes.includes(
      LONG_ANIMATION_FRAME_PERFORMANCE_TYPE
    );
  }

  private _createSpanFromEntry(entry: PerformanceLongAnimationFrameTiming) {
    const span = this.tracer.startSpan(LONG_ANIMATION_FRAME_PERFORMANCE_TYPE, {
      startTime: hrTime(entry.startTime),
    });
    const { observerCallback } = this.getConfig();
    if (observerCallback) {
      try {
        observerCallback(span, { longAnimationFrameEntry: entry });
      } catch (err) {
        diag.error(
          'long-animation-frame instrumentation: observer callback failed',
          err
        );
      }
    }
    span.setAttribute('long_animation_frame.name', entry.name);
    span.setAttribute('long_animation_frame.entry_type', entry.entryType);
    span.setAttribute('long_animation_frame.duration', entry.duration);
    span.setAttribute(
      'long_animation_frame.blocking_duration',
      entry.blockingDuration
    );
    span.setAttribute('long_animation_frame.render_start', entry.renderStart);
    span.setAttribute(
      'long_animation_frame.style_and_layout_start',
      entry.styleAndLayoutStart
    );
    span.setAttribute(
      'long_animation_frame.first_ui_event_timestamp',
      entry.firstUIEventTimestamp
    );

    if (Array.isArray(entry.scripts)) {
      entry.scripts.forEach((script, index) => {
        const prefix =
          entry.scripts.length > 1
            ? `long_animation_frame.script[${index}]`
            : 'long_animation_frame.script';
        span.setAttribute(`${prefix}.name`, script.name);
        span.setAttribute(`${prefix}.entry_type`, script.entryType);
        span.setAttribute(`${prefix}.start_time`, script.startTime);
        span.setAttribute(`${prefix}.duration`, script.duration);
        span.setAttribute(`${prefix}.execution_start`, script.executionStart);
        span.setAttribute(`${prefix}.invoker`, script.invoker);
        span.setAttribute(`${prefix}.invoker_type`, script.invokerType);
        span.setAttribute(`${prefix}.source_url`, script.sourceURL);
        span.setAttribute(
          `${prefix}.source_function_name`,
          script.sourceFunctionName
        );
        span.setAttribute(
          `${prefix}.source_char_position`,
          script.sourceCharPosition
        );
        span.setAttribute(`${prefix}.pause_duration`, script.pauseDuration);
        span.setAttribute(
          `${prefix}.forced_style_and_layout_duration`,
          script.forcedStyleAndLayoutDuration
        );
        span.setAttribute(
          `${prefix}.window_attribution`,
          script.windowAttribution
        );
      });
    }

    span.end(hrTime(entry.startTime + entry.duration));
  }

  override enable() {
    if (!this.isSupported()) {
      this._diag.debug('Environment not supported');
      return;
    }

    if (this._observer) {
      // Already enabled
      return;
    }

    this._observer = new PerformanceObserver(list => {
      list
        .getEntries()
        .forEach(entry =>
          this._createSpanFromEntry(
            entry as PerformanceLongAnimationFrameTiming
          )
        );
    });
    this._observer.observe({
      type: LONG_ANIMATION_FRAME_PERFORMANCE_TYPE,
      buffered: true,
    });
  }

  override disable() {
    if (!this._observer) {
      return;
    }

    this._observer.disconnect();
    this._observer = undefined;
  }
}
