/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context } from '@opentelemetry/api';
import { logs, Logger, SeverityNumber } from '@opentelemetry/api-logs';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { format } from 'util';
import { ConsoleInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

/** Console methods to instrument and their severity mappings. */
const CONSOLE_METHODS: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  dir: SeverityNumber.INFO,
};

/** Severity text labels for console methods. */
const CONSOLE_SEVERITY_TEXT: Record<string, string> = {
  trace: 'trace',
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  dir: 'info',
};

export class ConsoleInstrumentation extends InstrumentationBase<ConsoleInstrumentationConfig> {
  private _otelLogger: Logger | undefined;
  private _isEmitting = false;
  private _originals: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(config: ConsoleInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  private _getOTelLogger(): Logger {
    if (!this._otelLogger) {
      this._otelLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
    }
    return this._otelLogger;
  }

  override setConfig(config: ConsoleInstrumentationConfig = {}) {
    super.setConfig(config);
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
      (console as any)[method] = this._createPatchedMethod(method, original);
    }
  }

  private _unpatchConsole(): void {
    for (const [method, original] of this._originals) {
      (console as any)[method] = original;
    }
    this._originals.clear();
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

      if (!instrumentation.isEnabled() || instrumentation._isEmitting) {
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

      // Set the re-entrancy guard before emitting to the OTel logger.
      // This prevents infinite loops when an exporter (e.g. ConsoleLogRecordExporter)
      // calls console.log() to export the record we just created.
      instrumentation._isEmitting = true;
      try {
        const otelLogger = instrumentation._getOTelLogger();
        const timestamp = Date.now();
        // Pass the active context so the Logs SDK can associate the
        // LogRecord with the currently active span (trace context).
        otelLogger.emit({
          timestamp,
          observedTimestamp: timestamp,
          severityNumber,
          severityText: CONSOLE_SEVERITY_TEXT[methodName],
          body: message,
          context: context.active(),
        });

        return original.apply(this, args);
      } finally {
        instrumentation._isEmitting = false;
      }
    };
  }
}

/**
 * Format console arguments into a string using Node.js util.format,
 * which handles %s/%d/%j format codes and util.inspect-style object output.
 */
function formatArgs(args: unknown[]): string {
  return format(...args);
}
