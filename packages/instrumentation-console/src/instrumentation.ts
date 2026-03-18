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

import { context, trace, isSpanContextValid, Span } from '@opentelemetry/api';
import { logs, Logger, LogAttributes } from '@opentelemetry/api-logs';
import {
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  ConsoleInstrumentationConfig,
  CONSOLE_METHODS,
  CONSOLE_SEVERITY_TEXT,
} from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const DEFAULT_CONFIG: ConsoleInstrumentationConfig = {
  disableLogSending: false,
  disableLogCorrelation: false,
};

export class ConsoleInstrumentation extends InstrumentationBase<ConsoleInstrumentationConfig> {
  private _otelLogger: Logger | undefined;
  private _isEmitting = false;
  private _originals: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(config: ConsoleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
  }

  private _getOTelLogger(): Logger {
    if (!this._otelLogger) {
      this._otelLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
    }
    return this._otelLogger;
  }

  override setConfig(config: ConsoleInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  // console is a global object, not a require'd module, so we don't use
  // InstrumentationNodeModuleDefinition. Instead, we directly patch the
  // global console in enable() and restore in disable().
  protected init() {
    // No module definitions — we patch the global console directly.
    return undefined;
  }

  override enable(): void {
    super.enable();
    this._patchConsole();
  }

  override disable(): void {
    super.disable();
    this._unpatchConsole();
  }

  private _patchConsole(): void {
    if (!this._originals) {
      this._originals = new Map();
    }
    for (const method of Object.keys(CONSOLE_METHODS)) {
      const original = (console as any)[method];
      if (typeof original !== 'function') continue;

      // Don't double-patch
      if (this._originals.has(method)) continue;

      this._originals.set(method, original);
      (console as any)[method] = this._createPatchedMethod(
        method,
        original
      );
    }
  }

  private _unpatchConsole(): void {
    for (const [method, original] of this._originals) {
      (console as any)[method] = original;
    }
    this._originals.clear();
  }

  private _callHook(span: Span, record: Record<string, any>) {
    const { logHook } = this.getConfig();

    if (typeof logHook !== 'function') {
      return;
    }

    safeExecuteInTheMiddle(
      () => logHook(span, record),
      err => {
        if (err) {
          this._diag.error('error calling logHook', err);
        }
      },
      true
    );
  }

  private _createPatchedMethod(
    methodName: string,
    original: (...args: unknown[]) => void
  ): (...args: unknown[]) => void {
    const instrumentation = this;
    return function patchedConsoleMethod(
      this: Console,
      ...args: unknown[]
    ): void {
      const config = instrumentation.getConfig();

      if (
        !instrumentation.isEnabled() ||
        config.disableLogSending ||
        instrumentation._isEmitting
      ) {
        return original.apply(this, args);
      }

      const severityNumber = CONSOLE_METHODS[methodName];
      if (
        config.logSeverity !== undefined &&
        severityNumber < config.logSeverity
      ) {
        return original.apply(this, args);
      }

      const message = formatArgs(args);

      const attributes: LogAttributes = {};

      // Add trace context to attributes for log correlation
      // The OTel SDK also auto-populates spanContext on the LogRecord
      // from the active context, so these attributes are for additional
      // correlation in the log output itself.
      if (!config.disableLogCorrelation) {
        const span = trace.getSpan(context.active());
        if (span) {
          const spanContext = span.spanContext();
          if (isSpanContextValid(spanContext)) {
            attributes['trace_id'] = spanContext.traceId;
            attributes['span_id'] = spanContext.spanId;
            attributes['trace_flags'] = `0${spanContext.traceFlags.toString(16)}`;

            instrumentation._callHook(span, attributes);
          }
        }
      }

      // Set the re-entrancy guard before emitting to the OTel logger.
      // This prevents infinite loops when an exporter (e.g. ConsoleLogRecordExporter)
      // calls console.log() to export the record we just created.
      instrumentation._isEmitting = true;
      try {
        const otelLogger = instrumentation._getOTelLogger();
        const timestamp = Date.now();
        otelLogger.emit({
          timestamp,
          observedTimestamp: timestamp,
          severityNumber,
          severityText: CONSOLE_SEVERITY_TEXT[methodName],
          body: message,
          attributes,
        });

        return original.apply(this, args);
      } finally {
        instrumentation._isEmitting = false;
      }
    };
  }
}

/**
 * Format console arguments into a string, similar to how Node.js console does it.
 */
function formatArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return args
    .map(arg => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}
