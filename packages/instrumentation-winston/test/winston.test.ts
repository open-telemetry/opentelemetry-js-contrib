/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SeverityNumber, logs } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { context, trace, Span, INVALID_SPAN_CONTEXT } from '@opentelemetry/api';
import { isWrapped } from '@opentelemetry/instrumentation';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Writable } from 'stream';
import type { Winston2Logger, Winston3Logger } from '../src/internal-types';
import {
  WinstonInstrumentation,
  otelLogLevels,
  otelSeverityMapping,
} from '../src';

const memoryExporter = new InMemorySpanExporter();
const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
});
const tracer = provider.getTracer('default');
context.setGlobalContextManager(new AsyncLocalStorageContextManager());

const memoryLogExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor({ exporter: memoryLogExporter })],
});
logs.setGlobalLoggerProvider(loggerProvider);

const kMessage = 'log-message';

describe('WinstonInstrumentation', () => {
  let logger: Winston3Logger | Winston2Logger;
  let writeSpy: sinon.SinonSpy;
  let instrumentation: WinstonInstrumentation;
  let isWinston2 = false;

  const LevelsType = {
    npm: 0,
    syslog: 1,
    cli: 2,
    otel: 3,
  } as const;
  type LevelsType = (typeof LevelsType)[keyof typeof LevelsType];

  /**
   * Set `logger` to a new Winston logger instance with the given
   * configuration, and setup with `writeSpy` to spy on emitted logs.
   */
  function initLogger(
    levelsType?: LevelsType,
    formatType?: string,
    customLevels?: Record<string, number>
  ) {
    const winston = require('winston');

    let levels = winston.config.npm.levels;
    if (levelsType === LevelsType.syslog) {
      levels = winston.config.syslog.levels;
    } else if (levelsType === LevelsType.cli) {
      levels = winston.config.cli.levels;
    } else if (levelsType === LevelsType.otel) {
      levels = otelLogLevels;
    } else if (customLevels) {
      levels = customLevels;
    }

    let format;
    switch (formatType) {
      case 'colorize':
        format = winston.format.colorize();
        break;
      case 'errors':
        format = winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.json()
        );
        break;
      case 'none':
      case undefined:
        format = undefined;
        break;
      default:
        throw new Error(`unknown formatType: "${formatType}"`);
    }

    const stream = new Writable();
    stream._write = () => {};
    writeSpy = sinon.spy(stream, 'write');

    let defaultLevel = 'debug';
    if (levelsType === LevelsType.otel) {
      defaultLevel = 'trace';
    } else if (customLevels) {
      defaultLevel = Object.keys(customLevels).reduce((a, b) =>
        customLevels[a] > customLevels[b] ? a : b
      );
    }

    if (winston['createLogger']) {
      // winston 3.x
      logger = winston.createLogger({
        level: defaultLevel,
        levels: levels,
        format,
        transports: [
          new winston.transports.Stream({
            stream,
          }),
        ],
      });
    } else if (winston['Logger']) {
      // winston 2.x
      isWinston2 = true;
      logger = new winston.Logger({
        levels: levels,
        format,
        transports: [
          new winston.transports.File({
            stream,
          }),
        ],
      });
    }
  }

  function testInjection(span: Span) {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const { traceId, spanId, traceFlags } = span.spanContext();
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], traceId);
    assert.strictEqual(record['span_id'], spanId);
    assert.strictEqual(record['trace_flags'], `0${traceFlags.toString(16)}`);
    assert.strictEqual(kMessage, record['message']);
    return record;
  }

  function testNoInjection() {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], undefined);
    assert.strictEqual(record['span_id'], undefined);
    assert.strictEqual(record['trace_flags'], undefined);
    assert.strictEqual(kMessage, record['message']);
    return record;
  }

  function testEmitLogRecord(span: Span) {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 1);
    const { traceId, spanId, traceFlags } = span.spanContext();
    assert.strictEqual(logRecords[0].spanContext?.traceId, traceId);
    assert.strictEqual(logRecords[0].spanContext?.spanId, spanId);
    assert.strictEqual(logRecords[0].spanContext?.traceFlags, traceFlags);
    assert.strictEqual(logRecords[0].attributes['trace_id'], undefined);
    assert.strictEqual(logRecords[0].attributes['span_id'], undefined);
    assert.strictEqual(logRecords[0].attributes['trace_flags'], undefined);
    assert.strictEqual(kMessage, logRecords[0].body, kMessage);
    return logRecords;
  }

  function testNoEmitLogRecord() {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 0);
    return logRecords;
  }

  before(() => {
    instrumentation = new WinstonInstrumentation();
    instrumentation.enable();
  });

  describe('enabled instrumentation', () => {
    beforeEach(() => {
      initLogger();
      instrumentation.setConfig({}); // reset to defaults
      memoryLogExporter.getFinishedLogRecords().length = 0; // clear
    });

    it('wraps write', () => {
      if ('write' in logger) {
        // winston 3.x
        assert.ok(isWrapped(logger['write']));
      } else {
        // winston 2.x
        // winston 3.x also has "log", so the order for the checks has to be this
        assert.ok(isWrapped(logger['log']));
      }
    });

    it('wraps configure', () => {
      if (!isWinston2) {
        // winston 3.x
        assert.ok(isWrapped(logger['configure']));
      }
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });

    it('calls the users log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('emit LogRecord', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
        });
        initLogger();
        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testEmitLogRecord(span);
        });
      }
    });

    it('preserves span context across queued log records', async () => {
      if (!isWinston2) {
        const winston = require('winston');
        class BlockingTransport extends Writable {
          constructor() {
            super({ objectMode: true, highWaterMark: 1 });
          }

          override _write(
            _chunk: unknown,
            _encoding: BufferEncoding,
            callback: (error?: Error | null) => void
          ) {
            setImmediate(callback);
          }

          log(_info: unknown, callback: () => void) {
            callback();
          }
        }

        instrumentation.setConfig({
          disableLogSending: false,
        });
        logger = winston.createLogger({
          transports: [new BlockingTransport()],
        });

        logger.info('outside span');

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          logger.info(kMessage);
        });
        span.end();

        await new Promise<void>(resolve => setImmediate(resolve));

        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 2);
        assert.strictEqual(logRecords[0].spanContext, undefined);
        const { traceId, spanId, traceFlags } = span.spanContext();
        assert.strictEqual(logRecords[1].spanContext?.traceId, traceId);
        assert.strictEqual(logRecords[1].spanContext?.spanId, spanId);
        assert.strictEqual(logRecords[1].spanContext?.traceFlags, traceFlags);
      }
    });

    it('emit LogRecord with extra attibutes', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
        });
        const extraAttributes = {
          extraAttribute1: 'attributeValue1',
          extraAttribute2: 'attributeValue2',
        };
        logger.log('info', kMessage, extraAttributes);
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].severityText, 'info');
        assert.strictEqual(logRecords[0].body, kMessage);
        assert.strictEqual(
          logRecords[0].attributes['extraAttribute1'],
          'attributeValue1'
        );
        assert.strictEqual(
          logRecords[0].attributes['extraAttribute2'],
          'attributeValue2'
        );
      }
    });

    it('serializes Error metadata attributes', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
        });
        initLogger();
        const failure = new TypeError('boom');

        logger.log('info', kMessage, { failure });

        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.deepStrictEqual(logRecords[0].attributes['failure'], {
          name: 'TypeError',
          message: 'boom',
          stack: failure.stack,
        });
      }
    });

    it('emit LogRecord with exception attributes', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
        });
        initLogger(undefined, 'errors');

        (logger as any).error(new Error('boom'));
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].body, 'boom');
        assert.strictEqual(
          logRecords[0].attributes['exception.message'],
          'boom'
        );
        assert.strictEqual(logRecords[0].attributes['exception.type'], 'Error');
        assert.ok(
          typeof logRecords[0].attributes['exception.stacktrace'] === 'string'
        );
        assert.strictEqual(logRecords[0].attributes['stack'], undefined);

        initLogger();
      }
    });

    it('emit LogRecord with correct severity* when colorize() formatter is used', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
        });
        initLogger(LevelsType.npm, 'colorize');

        logger.log('debug', kMessage);
        logger.log('info', kMessage);
        logger.log('warn', kMessage);
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 3);
        assert.strictEqual(logRecords[0].severityText, 'debug');
        assert.strictEqual(logRecords[0].severityNumber, 5);
        assert.strictEqual(logRecords[0].body, kMessage);
        assert.strictEqual(logRecords[1].severityText, 'info');
        assert.strictEqual(logRecords[1].severityNumber, 9);
        assert.strictEqual(logRecords[1].body, kMessage);
        assert.strictEqual(logRecords[2].severityText, 'warn');
        assert.strictEqual(logRecords[2].severityNumber, 13);
        assert.strictEqual(logRecords[2].body, kMessage);

        initLogger();
      }
    });

    it('do not emit log record if @opentelemetry/winston-transport load fails', () => {
      const module = require('module');
      const originalRequire = module.prototype.require;
      module.prototype.require = function () {
        if (arguments[0] === '@opentelemetry/winston-transport') {
          throw new Error('@opentelemetry/winston-transport not present');
        }
        return originalRequire.apply(this, arguments);
      };

      instrumentation.setConfig({
        disableLogSending: false,
      });
      initLogger();
      module.prototype.require = originalRequire;
      testNoEmitLogRecord();
    });

    it('does not emit LogRecord if config off', () => {
      instrumentation.setConfig({
        disableLogSending: true,
      });
      initLogger();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testNoEmitLogRecord();
      });
    });

    it('does not inject span context if no span is active', () => {
      assert.strictEqual(trace.getSpan(context.active()), undefined);
      testNoInjection();
    });

    it('does not inject span context if config off', () => {
      instrumentation.setConfig({
        enabled: true,
        disableLogCorrelation: true,
      });
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testNoInjection();
      });
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
        testNoInjection();
      });
    });

    it('does not propagate exceptions from user hooks', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: () => {
          throw new Error('Oops');
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });
  });

  describe('disabled instrumentation', () => {
    before(() => {
      instrumentation.disable();
    });

    after(() => {
      instrumentation.enable();
    });

    beforeEach(() => {
      initLogger();
      memoryLogExporter.getFinishedLogRecords().length = 0; // clear
    });

    it('does not inject span context', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testNoInjection();
      });
    });

    it('does not call log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: false,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testNoInjection();
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });

    it('does not emit logRecord', () => {
      testNoEmitLogRecord();
    });
  });

  describe('emit logRecord severity', () => {
    beforeEach(() => {
      instrumentation.setConfig({
        disableLogSending: false,
      });
      memoryLogExporter.getFinishedLogRecords().length = 0; // clear
    });

    it('npm levels', () => {
      if (!isWinston2) {
        initLogger();
        logger.log('http', kMessage);
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].severityText, 'http');
        assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.DEBUG3);
      }
    });

    it('cli levels', () => {
      if (!isWinston2) {
        initLogger(LevelsType.cli);
        logger.log('data', kMessage);
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].severityText, 'data');
        assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.INFO2);
      }
    });

    it('syslog levels', () => {
      if (!isWinston2) {
        initLogger(LevelsType.syslog);
        logger.log('emerg', kMessage);
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].severityText, 'emerg');
        assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.FATAL3);
      }
    });

    it('otel levels', () => {
      if (!isWinston2) {
        initLogger(LevelsType.otel);
        logger.log('trace', 'trace msg');
        logger.log('debug', 'debug msg');
        logger.log('info', 'info msg');
        logger.log('warn', 'warn msg');
        logger.log('error', 'error msg');
        logger.log('fatal', 'fatal msg');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 6);
        assert.strictEqual(logRecords[0].severityText, 'trace');
        assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.TRACE);
        assert.strictEqual(logRecords[1].severityText, 'debug');
        assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.DEBUG);
        assert.strictEqual(logRecords[2].severityText, 'info');
        assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.INFO);
        assert.strictEqual(logRecords[3].severityText, 'warn');
        assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.WARN);
        assert.strictEqual(logRecords[4].severityText, 'error');
        assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.ERROR);
        assert.strictEqual(logRecords[5].severityText, 'fatal');
        assert.strictEqual(logRecords[5].severityNumber, SeverityNumber.FATAL);
      }
    });

    it('custom severityMapping', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          severityMapping: {
            critical: SeverityNumber.FATAL2,
            caution: SeverityNumber.WARN2,
          },
        });
        const customLevels = { critical: 0, caution: 1, info: 2 };
        initLogger(undefined, undefined, customLevels);
        logger.log('critical', 'crit msg');
        logger.log('caution', 'warn msg');
        logger.log('info', 'info msg');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 3);
        assert.strictEqual(logRecords[0].severityText, 'critical');
        assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.FATAL2);
        assert.strictEqual(logRecords[1].severityText, 'caution');
        assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.WARN2);
        assert.strictEqual(logRecords[2].severityText, 'info');
        assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.INFO);
      }
    });

    it('exports otelLogLevels and otelSeverityMapping constants', () => {
      assert.deepStrictEqual(otelLogLevels, {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5,
      });
      assert.deepStrictEqual(otelSeverityMapping, {
        fatal: SeverityNumber.FATAL,
        error: SeverityNumber.ERROR,
        warn: SeverityNumber.WARN,
        info: SeverityNumber.INFO,
        debug: SeverityNumber.DEBUG,
        trace: SeverityNumber.TRACE,
      });
    });
  });
  describe('logSeverity config', () => {
    beforeEach(() => {
      instrumentation.setConfig({
        disableLogSending: false,
      });
      memoryLogExporter.getFinishedLogRecords().length = 0; // clear
    });

    it('npm levels', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.DEBUG,
        });
        initLogger(LevelsType.npm);
        logger.log('silly', 'silly');
        logger.log('debug', 'debug');
        logger.log('verbose', 'verbose');
        logger.log('http', 'http');
        logger.log('info', 'info');
        logger.log('warn', 'warn');
        logger.log('error', 'error');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 6);
        assert.strictEqual(logRecords[0].body, 'debug');
        assert.strictEqual(logRecords[1].body, 'verbose');
        assert.strictEqual(logRecords[2].body, 'http');
        assert.strictEqual(logRecords[3].body, 'info');
        assert.strictEqual(logRecords[4].body, 'warn');
        assert.strictEqual(logRecords[5].body, 'error');
      }
    });

    it('cli levels', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.INFO,
        });
        initLogger(LevelsType.cli);
        logger.log('silly', 'silly');
        logger.log('input', 'input');
        logger.log('verbose', 'verbose');
        logger.log('prompt', 'prompt');
        logger.log('debug', 'debug');
        logger.log('info', 'info');
        logger.log('data', 'data');
        logger.log('help', 'help');
        logger.log('warn', 'warn');
        logger.log('error', 'error');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 5);
        assert.strictEqual(logRecords[0].body, 'info');
        assert.strictEqual(logRecords[1].body, 'data');
        assert.strictEqual(logRecords[2].body, 'help');
        assert.strictEqual(logRecords[3].body, 'warn');
        assert.strictEqual(logRecords[4].body, 'error');
      }
    });

    it('syslog levels', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.WARN,
        });
        initLogger(LevelsType.syslog);
        logger.log('debug', 'debug');
        logger.log('info', 'info');
        logger.log('notice', 'notice');
        logger.log('warning', 'warning');
        logger.log('error', 'error');
        logger.log('crit', 'crit');
        logger.log('alert', 'alert');
        logger.log('emerg', 'emerg');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 5);
        assert.strictEqual(logRecords[0].body, 'warning');
        assert.strictEqual(logRecords[1].body, 'error');
        assert.strictEqual(logRecords[2].body, 'crit');
        assert.strictEqual(logRecords[3].body, 'alert');
        assert.strictEqual(logRecords[4].body, 'emerg');
      }
    });

    it('otel levels', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.WARN,
        });
        initLogger(LevelsType.otel);
        logger.log('trace', 'trace');
        logger.log('debug', 'debug');
        logger.log('info', 'info');
        logger.log('warn', 'warn');
        logger.log('error', 'error');
        logger.log('fatal', 'fatal');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 3);
        assert.strictEqual(logRecords[0].body, 'warn');
        assert.strictEqual(logRecords[1].body, 'error');
        assert.strictEqual(logRecords[2].body, 'fatal');
      }
    });

    it('custom severityMapping', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.ERROR,
          severityMapping: {
            emergency: SeverityNumber.FATAL,
            alert: SeverityNumber.ERROR,
            notice: SeverityNumber.INFO,
          },
        });
        const customLevels = { emergency: 0, alert: 1, notice: 2 };
        initLogger(undefined, undefined, customLevels);
        logger.log('notice', 'notice');
        logger.log('alert', 'alert');
        logger.log('emergency', 'emergency');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 2);
        assert.strictEqual(logRecords[0].body, 'alert');
        assert.strictEqual(logRecords[1].body, 'emergency');
      }
    });

    it('custom severityMapping with fallback to default levels', () => {
      if (!isWinston2) {
        instrumentation.setConfig({
          disableLogSending: false,
          logSeverity: SeverityNumber.INFO,
          severityMapping: {
            critical: SeverityNumber.FATAL,
            caution: SeverityNumber.WARN,
          },
        });
        const customLevels = {
          critical: 0,
          error: 1,
          caution: 2,
          warn: 3,
          info: 4,
          debug: 5,
        };
        initLogger(undefined, undefined, customLevels);
        logger.log('critical', 'crit msg');
        logger.log('error', 'err msg');
        logger.log('caution', 'caution msg');
        logger.log('warn', 'warn msg');
        logger.log('info', 'info msg');
        logger.log('debug', 'debug msg');
        const logRecords = memoryLogExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 5);
        assert.strictEqual(logRecords[0].body, 'crit msg');
        assert.strictEqual(logRecords[1].body, 'err msg');
        assert.strictEqual(logRecords[2].body, 'caution msg');
        assert.strictEqual(logRecords[3].body, 'warn msg');
        assert.strictEqual(logRecords[4].body, 'info msg');
      }
    });
  });
});
