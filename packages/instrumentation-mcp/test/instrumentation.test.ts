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

import { McpInstrumentation } from '../src';
import { MCPSpanAttributes } from '../src/attributes';
import { updateSpanFromRequest } from '../src/utils';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

describe('McpInstrumentation', () => {
  describe('Configuration', () => {
    it('should accept debug log file via config', () => {
      const tmpFile = path.join(os.tmpdir(), 'test-mcp-debug-config.log');
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }

      const instrumentation = new McpInstrumentation({
        debugLogFile: tmpFile,
      });
      instrumentation.enable();

      assert.ok(fs.existsSync(tmpFile), 'Debug log file should be created');
      const content = fs.readFileSync(tmpFile, 'utf8');
      assert.ok(
        content.includes('Enabling MCP instrumentation'),
        'Should log enable message'
      );

      instrumentation.disable();
      fs.unlinkSync(tmpFile);
    });

    it('should accept debug log file via environment variable', () => {
      const tmpFile = path.join(os.tmpdir(), 'test-mcp-debug-env.log');
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }

      process.env.OTEL_INSTRUMENTATION_MCP_DEBUG_LOG_FILE = tmpFile;
      const instrumentation = new McpInstrumentation();
      instrumentation.enable();

      assert.ok(
        fs.existsSync(tmpFile),
        'Debug log file should be created from env var'
      );
      const content = fs.readFileSync(tmpFile, 'utf8');
      assert.ok(
        content.includes('Enabling MCP instrumentation'),
        'Should log enable message'
      );

      instrumentation.disable();
      fs.unlinkSync(tmpFile);
      delete process.env.OTEL_INSTRUMENTATION_MCP_DEBUG_LOG_FILE;
    });

    it('should not create log file when debug logging is disabled', () => {
      const tmpFile = path.join(os.tmpdir(), 'test-mcp-no-debug.log');
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }

      const instrumentation = new McpInstrumentation();
      instrumentation.enable();
      instrumentation.disable();

      assert.ok(
        !fs.existsSync(tmpFile),
        'Log file should not be created when debug is disabled'
      );
    });
  });

  describe('Span Attribute Updates', () => {
    let mockSpan: any;

    beforeEach(() => {
      mockSpan = {
        name: '',
        attributes: {},
        updateName(name: string) {
          this.name = name;
        },
        setAttribute(key: string, value: string | number) {
          this.attributes[key] = value;
        },
      };
    });

    it('should update span for tools/call with arguments', () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'calculate',
          arguments: { operation: 'add', x: 5, y: 3 },
        },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'tools/call calculate');
      assert.strictEqual(
        mockSpan.attributes[MCPSpanAttributes.MCP_TOOL_NAME],
        'calculate'
      );
      assert.strictEqual(
        mockSpan.attributes['mcp.request.argument.operation'],
        '"add"'
      );
      assert.strictEqual(mockSpan.attributes['mcp.request.argument.x'], '5');
      assert.strictEqual(mockSpan.attributes['mcp.request.argument.y'], '3');
    });

    it('should update span for tools/call without arguments', () => {
      const request = {
        method: 'tools/call',
        params: { name: 'get-status' },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'tools/call get-status');
      assert.strictEqual(
        mockSpan.attributes[MCPSpanAttributes.MCP_TOOL_NAME],
        'get-status'
      );
    });

    it('should update span for prompts/get', () => {
      const request = {
        method: 'prompts/get',
        params: { name: 'code-review' },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'prompts/get code-review');
      assert.strictEqual(
        mockSpan.attributes[MCPSpanAttributes.MCP_PROMPT_NAME],
        'code-review'
      );
    });

    it('should update span for resources/read', () => {
      const request = {
        method: 'resources/read',
        params: { uri: 'file:///project/README.md' },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(
        mockSpan.name,
        'resources/read file:///project/README.md'
      );
      assert.strictEqual(
        mockSpan.attributes[MCPSpanAttributes.MCP_RESOURCE_URI],
        'file:///project/README.md'
      );
    });

    it('should update span for resources/list', () => {
      const request = {
        method: 'resources/list',
        params: {},
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'resources/list');
    });

    it('should update span for generic methods', () => {
      const request = { method: 'initialize' };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'initialize');
    });

    it('should handle nested arguments in tool calls', () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'complex-tool',
          arguments: {
            nested: { deep: { value: 42 } },
            array: [1, 2, 3],
            bool: true,
          },
        },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(
        mockSpan.attributes['mcp.request.argument.nested'],
        '{"deep":{"value":42}}'
      );
      assert.strictEqual(
        mockSpan.attributes['mcp.request.argument.array'],
        '[1,2,3]'
      );
      assert.strictEqual(
        mockSpan.attributes['mcp.request.argument.bool'],
        'true'
      );
    });

    it('should handle resources/subscribe method', () => {
      const request = {
        method: 'resources/subscribe',
        params: { uri: 'file:///watch/path' },
      };

      updateSpanFromRequest(mockSpan, request);

      assert.strictEqual(mockSpan.name, 'resources/subscribe file:///watch/path');
      assert.strictEqual(
        mockSpan.attributes[MCPSpanAttributes.MCP_RESOURCE_URI],
        'file:///watch/path'
      );
    });
  });

  describe('Server Request Handler Patching', () => {
    let instrumentation: McpInstrumentation;

    beforeEach(() => {
      instrumentation = new McpInstrumentation();
    });

    afterEach(() => {
      instrumentation.disable();
    });

    it('should wrap setRequestHandler and preserve handler execution', async () => {
      const wrapper = (instrumentation as any)._patchServerRequestHandler();
      let handlerCalled = false;
      const originalHandler = async (_request: any) => {
        handlerCalled = true;
        return { result: 'success' };
      };

      const mockSetRequestHandler = (_schema: any, handler: any) => {
        return handler;
      };

      const wrappedSetRequestHandler = wrapper(mockSetRequestHandler);
      const wrappedHandler = wrappedSetRequestHandler({}, originalHandler);
      const result = await wrappedHandler({ method: 'test' });

      assert.ok(handlerCalled, 'Original handler should be called');
      assert.deepStrictEqual(result, { result: 'success' });
    });

    it('should extract trace context from request._meta', async () => {
      const wrapper = (instrumentation as any)._patchServerRequestHandler();

      let receivedRequest: any;
      const handler = async (request: any) => {
        receivedRequest = request;
        return { result: 'ok' };
      };

      const mockSetRequestHandler = (_schema: any, h: any) => h;
      const wrappedSetRequestHandler = wrapper(mockSetRequestHandler);
      const wrappedHandler = wrappedSetRequestHandler({}, handler);

      const request = {
        method: 'tools/call',
        params: {
          name: 'test',
          _meta: { traceparent: '00-trace-id-span-id-01' },
        },
      };

      await wrappedHandler(request);

      assert.ok(receivedRequest, 'Handler should receive request');
      assert.strictEqual(receivedRequest.method, 'tools/call');
    });

    it('should handle handler errors and propagate them', async () => {
      const wrapper = (instrumentation as any)._patchServerRequestHandler();
      const errorHandler = async () => {
        throw new Error('Handler failed');
      };

      const mockSetRequestHandler = (_schema: any, h: any) => h;
      const wrappedSetRequestHandler = wrapper(mockSetRequestHandler);
      const wrappedHandler = wrappedSetRequestHandler({}, errorHandler);

      await assert.rejects(async () => wrappedHandler({ method: 'test' }), {
        message: 'Handler failed',
      });
    });
  });

  describe('Client Request Patching', () => {
    let instrumentation: McpInstrumentation;
    beforeEach(() => {
      instrumentation = new McpInstrumentation();
      instrumentation.enable();
    });

    afterEach(() => {
      instrumentation.disable();
    });

    it('should wrap request method and preserve execution', async () => {
      const wrapper = (instrumentation as any)._patchClientRequest();
      let requestCalled = false;
      const originalRequest = async function (this: any, _req: any) {
        requestCalled = true;
        return { result: 'success' };
      };

      const wrappedRequest = wrapper(originalRequest);
      const result = await wrappedRequest.call({}, { method: 'test' });

      assert.ok(requestCalled, 'Original request should be called');
      assert.deepStrictEqual(result, { result: 'success' });
    });

    it('should inject trace context into request.params._meta', async () => {
      const wrapper = (instrumentation as any)._patchClientRequest();
      let capturedRequest: any;
      const mockRequest = async function (this: any, req: any) {
        capturedRequest = req;
        return { result: 'ok' };
      };

      const wrappedRequest = wrapper(mockRequest);
      const request = {
        method: 'tools/call',
        params: { name: 'test' },
      };

      await wrappedRequest.call({}, request);

      assert.ok(capturedRequest, 'Request should be captured');
      assert.ok(capturedRequest.params, 'Should have params');
      assert.ok(capturedRequest.params._meta, 'Should inject _meta field');
      assert.strictEqual(
        typeof capturedRequest.params._meta,
        'object',
        '_meta should be an object for trace context'
      );
    });

    it('should handle requests without params', async () => {
      const wrapper = (instrumentation as any)._patchClientRequest();
      let capturedRequest: any;
      const mockRequest = async function (this: any, req: any) {
        capturedRequest = req;
        return { result: 'ok' };
      };

      const wrappedRequest = wrapper(mockRequest);
      const request = { method: 'initialize' };
      await wrappedRequest.call({}, request);

      assert.ok(capturedRequest, 'Request should be captured');
      assert.ok(capturedRequest.params, 'Should create params object');
      assert.ok(
        capturedRequest.params._meta,
        'Should inject _meta even without params'
      );
    });

    it('should handle request errors and record exception', async () => {
      const wrapper = (instrumentation as any)._patchClientRequest();
      const errorRequest = async function (this: any) {
        throw new Error('Request failed');
      };

      const wrappedRequest = wrapper(errorRequest);
      await assert.rejects(
        async () => wrappedRequest.call({}, { method: 'test' }),
        { message: 'Request failed' }
      );
    });

    it('should preserve existing _meta fields when injecting trace context', async () => {
      const wrapper = (instrumentation as any)._patchClientRequest();
      let capturedRequest: any;
      const mockRequest = async function (this: any, req: any) {
        capturedRequest = req;
        return { result: 'ok' };
      };

      const wrappedRequest = wrapper(mockRequest);
      const request = {
        method: 'tools/call',
        params: {
          name: 'test',
          _meta: { customField: 'preserved' },
        },
      };

      await wrappedRequest.call({}, request);

      assert.ok(capturedRequest.params._meta.customField, 'Should preserve existing _meta');
      assert.strictEqual(capturedRequest.params._meta.customField, 'preserved');
    });
  });
});
