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
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { Attributes, Link, Span } from '@opentelemetry/api';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type * as bullmq from 'bullmq';
import type {
  FlowJob,
  FlowOpts,
  FlowProducer,
  Job,
  JobNode,
  JobsOptions,
  ParentOpts,
  Queue,
  Worker,
} from 'bullmq';
import { flatten } from 'flat';

import { PACKAGE_VERSION, PACKAGE_NAME } from './version';
import { SemanticAttributes, BullMQAttributes } from './attributes';

const BULK_CONTEXT = Symbol('BULLMQ_BULK_CONTEXT');
const FLOW_CONTEXT = Symbol('BULLMQ_FLOW_CONTEXT');

export interface BullMQInstrumentationConfig extends InstrumentationConfig {
  /**
   * Emit spans for each individual job enqueueing in calls to `Queue.addBulk`
   * or `FlowProducer.addBulk`. Defaults to true. Setting it to false disables
   * individual job spans for bulk operations.
   */
  emitCreateSpansForBulk?: boolean;

  /**
   * Emit spans for each individual job enqueueing in calls to `FlowProducer.add`
   * or `FlowProducer.addBulk`. Defaults to true. Setting it to false disables
   * individual job spans for bulk operations.
   */
  emitCreateSpansForFlow?: boolean;

  /** Require a parent span in order to create a producer span
   * (a span for the enqueueing of one or more jobs) -- defaults to `false` */
  requireParentSpanForPublish?: boolean;
}

export const defaultConfig: Required<BullMQInstrumentationConfig> = {
  emitCreateSpansForBulk: true,
  emitCreateSpansForFlow: true,
  requireParentSpanForPublish: false,
  // unused by `configFor` but required for the type
  enabled: true,
};

export class BullMQInstrumentation extends InstrumentationBase {
  protected override _config!: BullMQInstrumentationConfig;

  constructor(config: BullMQInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setConfig(config?: BullMQInstrumentationConfig) {
    super.setConfig(config);
  }

  /**
   * Init method will be called when the plugin is constructed.
   * It returns an `InstrumentationNodeModuleDefinition` which describes
   *   the node module to be instrumented and patched.
   * It may also return a list of `InstrumentationNodeModuleDefinition`s if
   *   the plugin should patch multiple modules or versions.
   */
  protected init() {
    return new InstrumentationNodeModuleDefinition<typeof bullmq>(
      'bullmq',
      ['1.*', '2.*', '3.*', '4.*', '5.*'],
      this._onPatchMain(),
      this._onUnPatchMain()
    ) as InstrumentationNodeModuleDefinition<any>;
  }

  private _onPatchMain() {
    return (moduleExports: typeof bullmq) => {
      this._diag.debug(`patching ${PACKAGE_NAME}@${PACKAGE_VERSION}`);

      this._wrap(moduleExports.Queue.prototype, 'add', this._patchQueueAdd());
      this._wrap(
        moduleExports.Queue.prototype,
        'addBulk',
        this._patchQueueAddBulk()
      );
      this._wrap(
        moduleExports.FlowProducer.prototype,
        'add',
        this._patchFlowProducerAdd()
      );
      this._wrap(
        moduleExports.FlowProducer.prototype,
        'addBulk',
        this._patchFlowProducerAddBulk()
      );
      this._wrap(moduleExports.Job.prototype, 'addJob', this._patchAddJob());

      this._wrap(
        moduleExports.Worker.prototype,
        'callProcessJob' as any,
        this._patchCallProcessJob()
      );

      return moduleExports;
    };
  }

  private _onUnPatchMain() {
    return (moduleExports: typeof bullmq) => {
      this._diag.debug(`un-patching ${PACKAGE_NAME}@${PACKAGE_VERSION}`);

      this._unwrap(moduleExports.Queue.prototype, 'add');
      this._unwrap(moduleExports.Queue.prototype, 'addBulk');
      this._unwrap(moduleExports.FlowProducer.prototype, 'add');
      this._unwrap(moduleExports.FlowProducer.prototype, 'addBulk');
      this._unwrap(moduleExports.Job.prototype, 'addJob');

      this._unwrap(moduleExports.Worker.prototype, 'callProcessJob' as any);
    };
  }

  private _patchAddJob(): (
    original: typeof bullmq.Job.prototype.addJob
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationName = 'Job.addJob';
    const operationType = 'create';

    return function addJob(original) {
      return async function patch(
        this: Job,
        client: never,
        parentOpts?: ParentOpts
      ): Promise<string> {
        const parentContext = context.active();
        const parentSpan = trace.getSpan(parentContext);

        if (parentSpan === undefined) {
          // This can happen when `requireParentSpanForPublish` is true.
          return await original.apply(this, [client, parentOpts]);
        }

        const isBulk = !!parentContext.getValue(BULK_CONTEXT);
        const isFlow = !!parentContext.getValue(FLOW_CONTEXT);

        let shouldSetAttributes = true;

        if (!instrumentation.shouldCreateSpan({ isBulk, isFlow })) {
          // If the configuration says that no individual job spans
          // should be created for this bulk/flow span, do not set
          // attributes in the parent span either.
          // This differs from the behaviour when the span is neither
          // bulk nor flow, in which case we do write attributes into
          // the parent span.
          shouldSetAttributes = false;
        }

        const shouldCreateSpan =
          (isBulk || isFlow) &&
          instrumentation.shouldCreateSpan({ isBulk, isFlow });

        let childSpan: Span | undefined;

        if (shouldCreateSpan) {
          const spanName = `${this.queueName} ${operationType}`;
          childSpan = tracer.startSpan(spanName, {
            kind: SpanKind.PRODUCER,
            attributes: {
              [SemanticAttributes.MESSAGING_OPERATION]: operationType,
              [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
            },
          });
        }

        const span = childSpan ?? parentSpan;

        if (shouldSetAttributes) {
          span.setAttributes(
            BullMQInstrumentation.dropInvalidAttributes({
              [SemanticAttributes.MESSAGING_SYSTEM]:
                BullMQAttributes.MESSAGING_SYSTEM,
              [SemanticAttributes.MESSAGING_DESTINATION]: this.queueName,
              [BullMQAttributes.JOB_NAME]: this.name,
              [BullMQAttributes.JOB_PARENT_KEY]: parentOpts?.parentKey,
              [BullMQAttributes.JOB_WAIT_CHILDREN_KEY]:
                parentOpts?.waitChildrenKey,
              ...BullMQInstrumentation.attrMap(
                BullMQAttributes.JOB_OPTS,
                this.opts
              ),
            })
          );
        }

        const messageContext = trace.setSpan(parentContext, span);

        propagation.inject(messageContext, this.opts);
        return await context.with(messageContext, async () => {
          try {
            return await original.apply(this, [client, parentOpts]);
          } catch (e) {
            throw BullMQInstrumentation.setError(span, e as Error);
          } finally {
            if (shouldSetAttributes) {
              span.setAttributes(
                BullMQInstrumentation.dropInvalidAttributes({
                  [SemanticAttributes.MESSAGING_MESSAGE_ID]: this.id,
                  [BullMQAttributes.JOB_TIMESTAMP]: this.timestamp,
                })
              );
            }
            if (shouldCreateSpan) {
              span.end();
            }
          }
        });
      };
    };
  }

  private _patchQueueAdd(): (
    original: typeof bullmq.Queue.prototype.add
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationName = 'Queue.add';
    const operationType = 'publish';

    return function add(original) {
      return async function patch(this: Queue, ...args: any): Promise<Job> {
        if (
          instrumentation.configFor('requireParentSpanForPublish') &&
          trace.getSpan(context.active()) === undefined
        ) {
          return await original.apply(this, args);
        }

        const spanName = `${this.name} ${operationType}`;
        const span = tracer.startSpan(spanName, {
          kind: SpanKind.PRODUCER,
          attributes: {
            [SemanticAttributes.MESSAGING_OPERATION]: operationType,
            [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
          },
        });

        return BullMQInstrumentation.withContext(this, original, span, args);
      };
    };
  }

  private _patchQueueAddBulk(): (
    original: typeof bullmq.Queue.prototype.addBulk
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationName = 'Queue.addBulk';
    const operationType = 'publish';

    return function addBulk(original) {
      return async function patch(
        this: bullmq.Queue,
        ...args: [bullmq.Job[]]
      ): Promise<bullmq.Job[]> {
        if (
          instrumentation.configFor('requireParentSpanForPublish') &&
          trace.getSpan(context.active()) === undefined
        ) {
          return await original.apply(this, args);
        }

        const names = args[0].map(job => job.name);

        const spanName = `${this.name} ${operationType}`;
        const spanKind = instrumentation.shouldCreateSpan({
          isBulk: true,
          isFlow: false,
        })
          ? SpanKind.INTERNAL
          : SpanKind.PRODUCER;

        const span = tracer.startSpan(spanName, {
          attributes: {
            [SemanticAttributes.MESSAGING_SYSTEM]:
              BullMQAttributes.MESSAGING_SYSTEM,
            [SemanticAttributes.MESSAGING_DESTINATION]: this.name,
            [SemanticAttributes.MESSAGING_OPERATION]: operationType,
            [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
            [BullMQAttributes.JOB_BULK_NAMES]: names,
            [BullMQAttributes.JOB_BULK_COUNT]: names.length,
          },
          kind: spanKind,
        });

        return BullMQInstrumentation.withContext(this, original, span, args, {
          [BULK_CONTEXT]: true,
        });
      };
    };
  }

  private _patchFlowProducerAdd(): (
    original: typeof bullmq.FlowProducer.prototype.add
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationName = 'FlowProducer.add';
    const operationType = 'publish';

    return function add(original) {
      return async function patch(
        this: FlowProducer,
        flow: FlowJob,
        opts?: FlowOpts
      ): Promise<JobNode> {
        if (
          instrumentation.configFor('requireParentSpanForPublish') &&
          trace.getSpan(context.active()) === undefined
        ) {
          return await original.apply(this, [flow, opts]);
        }

        const spanName = `${flow.queueName} ${operationType}`;
        const spanKind = instrumentation.shouldCreateSpan({
          isBulk: false,
          isFlow: true,
        })
          ? SpanKind.INTERNAL
          : SpanKind.PRODUCER;

        const span = tracer.startSpan(spanName, {
          attributes: {
            [SemanticAttributes.MESSAGING_SYSTEM]:
              BullMQAttributes.MESSAGING_SYSTEM,
            [SemanticAttributes.MESSAGING_DESTINATION]: flow.queueName,
            [SemanticAttributes.MESSAGING_OPERATION]: operationType,
            [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
            [BullMQAttributes.JOB_NAME]: flow.name,
          },
          kind: spanKind,
        });

        return BullMQInstrumentation.withContext(
          this,
          original,
          span,
          [flow, opts],
          {
            [FLOW_CONTEXT]: true,
          }
        );
      };
    };
  }

  private _patchFlowProducerAddBulk(): (
    original: typeof bullmq.FlowProducer.prototype.addBulk
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationName = 'FlowProducer.addBulk';
    const operationType = 'publish';

    return function addBulk(original) {
      return async function patch(
        this: FlowProducer,
        ...args: [FlowJob[]]
      ): Promise<JobNode[]> {
        if (
          instrumentation.configFor('requireParentSpanForPublish') &&
          trace.getSpan(context.active()) === undefined
        ) {
          return await original.apply(this, args);
        }

        const spanName = `(bulk) ${operationType}`;
        const spanKind = instrumentation.shouldCreateSpan({
          isBulk: true,
          isFlow: true,
        })
          ? SpanKind.INTERNAL
          : SpanKind.PRODUCER;

        const names = args[0].map(job => job.name);
        const span = tracer.startSpan(spanName, {
          attributes: {
            [SemanticAttributes.MESSAGING_SYSTEM]:
              BullMQAttributes.MESSAGING_SYSTEM,
            [SemanticAttributes.MESSAGING_OPERATION]: operationType,
            [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
            [BullMQAttributes.JOB_BULK_NAMES]: names,
            [BullMQAttributes.JOB_BULK_COUNT]: names.length,
          },
          kind: spanKind,
        });

        return BullMQInstrumentation.withContext(this, original, span, args, {
          [FLOW_CONTEXT]: true,
          [BULK_CONTEXT]: true,
        });
      };
    };
  }

  private _patchCallProcessJob(): (
    original: (...args: any[]) => any
  ) => (...args: any[]) => any {
    const instrumentation = this;
    const tracer = instrumentation.tracer;
    const operationType = 'process';
    const operationName = 'Worker.run';

    return function patch(original) {
      return async function callProcessJob(
        this: Worker,
        job: any,
        ...rest: any[]
      ) {
        const workerName = this.name ?? 'anonymous';
        const currentContext = context.active();
        const producerContext = propagation.extract(currentContext, job.opts);

        const spanName = `${job.queueName} ${operationType}`;
        const span = tracer.startSpan(spanName, {
          attributes: BullMQInstrumentation.dropInvalidAttributes({
            [SemanticAttributes.MESSAGING_SYSTEM]:
              BullMQAttributes.MESSAGING_SYSTEM,
            [SemanticAttributes.MESSAGING_CONSUMER_ID]: workerName,
            [SemanticAttributes.MESSAGING_MESSAGE_ID]: job.id,
            [SemanticAttributes.MESSAGING_OPERATION]: operationType,
            [BullMQAttributes.MESSAGING_OPERATION_NAME]: operationName,
            [BullMQAttributes.JOB_NAME]: job.name,
            [BullMQAttributes.JOB_ATTEMPTS]: job.attemptsMade,
            [BullMQAttributes.JOB_TIMESTAMP]: job.timestamp,
            [BullMQAttributes.JOB_DELAY]: job.delay,
            [BullMQAttributes.JOB_REPEAT_KEY]: job.repeatJobKey,
            ...BullMQInstrumentation.attrMap(
              BullMQAttributes.JOB_OPTS,
              job.opts
            ),
            [SemanticAttributes.MESSAGING_DESTINATION]: job.queueName,
            [BullMQAttributes.WORKER_CONCURRENCY]: this.opts?.concurrency,
            [BullMQAttributes.WORKER_LOCK_DURATION]: this.opts?.lockDuration,
            [BullMQAttributes.WORKER_LOCK_RENEW]: this.opts?.lockRenewTime,
            [BullMQAttributes.WORKER_RATE_LIMIT_MAX]: this.opts?.limiter?.max,
            [BullMQAttributes.WORKER_RATE_LIMIT_DURATION]:
              this.opts?.limiter?.duration,
            // Limit by group keys was removed in bullmq 3.x
            [BullMQAttributes.WORKER_RATE_LIMIT_GROUP]: (
              this.opts?.limiter as any
            )?.groupKey,
          }),
          kind: SpanKind.CONSUMER,
          links: BullMQInstrumentation.dropInvalidLinks([
            {
              context: trace.getSpanContext(producerContext),
            },
          ]),
        });

        const consumerContext = trace.setSpan(currentContext, span);

        return await context.with(consumerContext, async () => {
          try {
            const result = await original.apply(this, [job, ...rest]);
            return result;
          } catch (e) {
            throw BullMQInstrumentation.setError(span, e as Error);
          } finally {
            span.setAttributes(
              BullMQInstrumentation.dropInvalidAttributes({
                [BullMQAttributes.JOB_FINISHED_TIMESTAMP]: job.finishedOn,
                [BullMQAttributes.JOB_PROCESSED_TIMESTAMP]: job.processedOn,
                [BullMQAttributes.JOB_FAILED_REASON]: job.failedReason,
              })
            );

            span.end();
          }
        });
      };
    };
  }

  private configFor<K extends keyof BullMQInstrumentationConfig>(
    key: K
  ): Required<BullMQInstrumentationConfig>[K] {
    return this._config[key] ?? defaultConfig[key];
  }

  // Return whether, according to the configuration, a span should be created
  // for each job enqueued by the given kind (bulk, flow, both or neither)
  // of operation.
  private shouldCreateSpan({
    isBulk,
    isFlow,
  }: {
    isBulk: boolean;
    isFlow: boolean;
  }): boolean {
    if (isBulk && isFlow) {
      return (
        this.configFor('emitCreateSpansForBulk') &&
        this.configFor('emitCreateSpansForFlow')
      );
    } else if (isBulk) {
      return this.configFor('emitCreateSpansForBulk');
    } else if (isFlow) {
      return this.configFor('emitCreateSpansForFlow');
    } else {
      return true;
    }
  }

  private static setError = (span: Span, error: Error) => {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    return error;
  };

  private static attrMap(prefix: string, opts: JobsOptions): Attributes {
    const attrs = flatten({ [prefix]: opts }) as Attributes;
    return this.dropInvalidAttributes(attrs);
  }

  private static async withContext(
    thisArg: any,
    original: (...args: any[]) => any,
    span: Span,
    args: any[],
    contextValues: Record<symbol, unknown> = {}
  ): Promise<any> {
    const parentContext = context.active();
    let messageContext = trace.setSpan(parentContext, span);

    for (const key of Object.getOwnPropertySymbols(contextValues)) {
      messageContext = messageContext.setValue(key, contextValues[key]);
    }

    return await context.with(messageContext, async () => {
      try {
        return await original.apply(thisArg, args);
      } catch (e) {
        throw BullMQInstrumentation.setError(span, e as Error);
      } finally {
        span.end();
      }
    });
  }

  private static dropInvalidAttributes(attributes: Attributes): Attributes {
    const keys = Object.keys(attributes);
    for (const key of keys) {
      if (attributes[key] === undefined || attributes[key] === null) {
        delete attributes[key];
      }
    }

    return attributes;
  }

  private static dropInvalidLinks(links: Partial<Link>[]): Link[] {
    return links.filter(link => link.context !== undefined) as Link[];
  }
}
