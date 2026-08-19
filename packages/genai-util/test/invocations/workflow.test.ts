/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  TelemetryHandler,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from '../../src';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('WorkflowInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should create and populate workflow span with attributes on success', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const workflowInv = handler.startWorkflow({
      workflowName: 'document_qa_pipeline',
      attributes: { 'custom.wf.version': '1.0' },
    });
    workflowInv.setAttribute('stage', 'retrieval');
    workflowInv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'invoke_workflow document_qa_pipeline');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_WORKFLOW_NAME],
      'document_qa_pipeline'
    );
    assert.strictEqual(span.attributes['custom.wf.version'], '1.0');
    assert.strictEqual(span.attributes['stage'], 'retrieval');
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should preserve workflow identity, internal span kind, and custom attributes when workflow fails', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const workflowInv = handler.startWorkflow({
      workflowName: 'summarize_docs',
      attributes: { 'custom.wf.stage': 'extraction' },
    });
    workflowInv.setAttribute('stage', 'synthesis');
    workflowInv.fail(new Error('Workflow pipeline aborted'));

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(span.name, 'invoke_workflow summarize_docs');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_WORKFLOW_NAME],
      'summarize_docs'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
    );
    assert.strictEqual(span.attributes['custom.wf.stage'], 'extraction');
    assert.strictEqual(span.attributes['stage'], 'synthesis');
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Workflow pipeline aborted');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
  });
});
