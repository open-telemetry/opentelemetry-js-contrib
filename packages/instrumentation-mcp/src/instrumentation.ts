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

import { InstrumentationBase, isWrapped } from '@opentelemetry/instrumentation';
import {
  context,
  trace,
  propagation,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { Hook as HookRequire } from 'require-in-the-middle';
import { Hook as HookImport } from 'import-in-the-middle';

/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { McpInstrumentationConfig } from './types';
import { MCPSpanAttributes } from './attributes';
import {
  MCP_MODULE_NAMES,
  DEBUG_LOG_ENV_VAR,
  CLIENT_REQUEST_ID_PROPERTY,
  SERVER_REQUEST_ID_PROPERTY,
} from './constants';
import { updateSpanFromRequest, ensureMetaField, McpRequest } from './utils';

/**
 * MCP (Model Context Protocol) instrumentation for OpenTelemetry.
 *
 * Instruments the MCP SDK to create spans for client requests and server handlers,
 * propagate trace context, and capture MCP-specific attributes.
 */
export class McpInstrumentation extends InstrumentationBase<McpInstrumentationConfig> {
  private _mcpHooks?: (HookRequire | HookImport)[];

  constructor(config: McpInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  /**
   * Write debug log message to file if debug logging is enabled.
   *
   * In stdio transport mode, the MCP server's stdout/stderr are used for
   * protocol communication, so console logging would corrupt the message stream.
   * File-based debug logging is necessary for diagnostics in this scenario.
   *
   * Checks both config.debugLogFile and OTEL_INSTRUMENTATION_MCP_DEBUG_LOG_FILE env var.
   */
  private _debugLog(message: string): void {
    const logFile =
      this.getConfig().debugLogFile || process.env[DEBUG_LOG_ENV_VAR];
    if (!logFile) return;

    try {
      const fs = require('fs');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    } catch (_e) {
      // Silently fail to avoid breaking instrumentation
    }
  }

  /**
   * Initialize the instrumentation.
   *
   * Returns empty array because this instrumentation uses runtime hooks
   * (require-in-the-middle/import-in-the-middle) instead of static module
   * descriptors. Module patching is performed in enable().
   */
  init() {
    return [];
  }

  /**
   * Enable MCP instrumentation by registering hooks for CommonJS and ESM modules.
   *
   * Creates hooks that intercept MCP SDK module loading and patch:
   * - Client.prototype.request - Wraps client requests with tracing
   * - Server.prototype.setRequestHandler - Wraps server handlers with tracing
   *
   * Hooks are registered for both CJS (require-in-the-middle) and ESM
   * (import-in-the-middle) to support different module systems.
   */
  override enable() {
    if (this._mcpHooks && this._mcpHooks.length > 0) return;

    this._debugLog(
      `Enabling MCP instrumentation with modules: ${JSON.stringify(
        MCP_MODULE_NAMES
      )}`
    );
    const self = this;
    this._mcpHooks = [];

    // Create CJS hook
    const cjsHook = new HookRequire(
      MCP_MODULE_NAMES as unknown as string[],
      { internals: true },
      (exports, name, basedir) => {
        self._debugLog(`CJS hook called for: ${name}, basedir: ${basedir}`);
        self._diag.debug(`Patching MCP module (CJS): ${name}`);
        return self._patchModule(exports, basedir);
      }
    );
    this._mcpHooks.push(cjsHook);

    // Create ESM hook
    const esmHook = new HookImport(
      MCP_MODULE_NAMES as unknown as string[],
      { internals: true },
      (exports, name, basedir) => {
        self._debugLog(`ESM hook called for: ${name}, basedir: ${basedir}`);
        self._diag.debug(`Patching MCP module (ESM): ${name}`);
        return self._patchModule(exports, basedir);
      }
    );
    this._mcpHooks.push(esmHook);
    this._debugLog('MCP instrumentation hooks created');
  }

  /**
   * Disable MCP instrumentation by unhooking all registered hooks.
   */
  override disable() {
    if (this._mcpHooks) {
      for (const hook of this._mcpHooks) {
        hook.unhook();
      }
      this._mcpHooks = undefined;
    }
  }

  /**
   * Patch MCP SDK module exports.
   *
   * Called by hooks when MCP SDK modules are loaded. Wraps:
   * - Client.prototype.request if Client class is present
   * - Server.prototype.setRequestHandler if Server class is present
   *
   * Also handles McpServer by loading and patching the base Server class
   * from the module's basedir.
   *
   * @param moduleExports - The module's exports object
   * @param basedir - The module's base directory (used for McpServer patching)
   * @returns The (potentially modified) module exports
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _patchModule(moduleExports: any, basedir?: string | void) {
    const keys = Object.keys(moduleExports).slice(0, 20);
    this._debugLog(
      `_patchModule called, exports keys: ${JSON.stringify(keys)}`
    );

    // Patch Client from client/index.js
    if (
      moduleExports.Client &&
      !isWrapped(moduleExports.Client.prototype.request)
    ) {
      this._debugLog('Patching Client.request');
      this._wrap(
        moduleExports.Client.prototype,
        'request',
        this._patchClientRequest()
      );
    }

    // Patch Server from server/index.js (base class)
    if (
      moduleExports.Server &&
      !isWrapped(moduleExports.Server.prototype.setRequestHandler)
    ) {
      this._debugLog('Patching Server.setRequestHandler');
      this._wrap(
        moduleExports.Server.prototype,
        'setRequestHandler',
        this._patchServerRequestHandler()
      );
    }

    // WORKAROUND: Handle McpServer loading before base Server class
    //
    // Problem: The MCP SDK has this class hierarchy:
    //   Server (base class in server/index.js)
    //     └── McpServer (extends Server, in server/mcp.js)
    //
    // When user code imports McpServer directly, the hook may fire for McpServer
    // before the base Server class is loaded, causing Server.prototype.setRequestHandler
    // to remain unpatched.
    //
    // Solution: When we detect McpServer being loaded, explicitly load and patch
    // the base Server class from the SDK's known location (dist/cjs or dist/esm).
    //
    // This is necessary because:
    // 1. Hooks fire per-module, not per-class
    // 2. McpServer and Server are in different files
    // 3. We can't control which module the user imports first
    //
    // Trade-offs:
    // - Assumes SDK internal structure (dist/cjs or dist/esm)
    // - Fragile if SDK restructures (mitigated by try-catch)
    // - Common pattern in OpenTelemetry instrumentations for similar issues
    if (moduleExports.McpServer && basedir) {
      this._patchServerViaBasedir(basedir);
    }

    return moduleExports;
  }

  /**
   * Patch Server class by loading it from basedir when McpServer is detected.
   *
   * This is a workaround for the module loading order problem where McpServer
   * may be loaded before the base Server class, leaving Server unpatched.
   *
   * Implementation details:
   * - Detects module type (CJS vs ESM) from basedir path
   * - Constructs path to Server class: basedir/dist/{cjs|esm}/server/index.js
   * - Explicitly requires/imports the Server module
   * - Patches Server.prototype.setRequestHandler if not already wrapped
   * - Wrapped in try-catch to fail gracefully if SDK structure changes
   *
   * Known limitations:
   * - Assumes MCP SDK internal structure (dist/cjs or dist/esm)
   * - Will fail silently if SDK restructures (logged to debug and diag)
   *
   * Alternative approaches considered:
   * - Rely on hook order: Unreliable, depends on user import order
   * - Patch McpServer instead: Doesn't work, need to patch base class
   * - Require users to import Server: Bad developer experience
   *
   * @param basedir - The MCP SDK module's base directory
   */
  private _patchServerViaBasedir(basedir: string): void {
    this._debugLog(`Found McpServer, loading Server from basedir: ${basedir}`);
    try {
      const path = require('path');

      // Detect module type: if basedir contains '/esm/', use ESM path, otherwise CJS
      const isESM = basedir.includes('/esm/') || basedir.includes('\\esm\\');
      const moduleType = isESM ? 'esm' : 'cjs';
      const serverIndexPath = path.join(
        basedir,
        `dist/${moduleType}/server/index.js`
      );

      this._debugLog(
        `Detected module type: ${moduleType}, requiring Server from: ${serverIndexPath}`
      );
      const serverModule = require(serverIndexPath);
      if (
        serverModule.Server &&
        !isWrapped(serverModule.Server.prototype.setRequestHandler)
      ) {
        this._debugLog('Patching Server.setRequestHandler via McpServer');
        this._wrap(
          serverModule.Server.prototype,
          'setRequestHandler',
          this._patchServerRequestHandler()
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this._debugLog(`Error loading Server: ${e?.message}`);
      this._diag.error(`Failed to patch Server class: ${e?.message}`);
    }
  }

  /**
   * Create wrapper for Client.prototype.request method.
   *
   * Wraps client requests to:
   * 1. Create a CLIENT span with mcp.client name
   * 2. Add MCP-specific attributes (method, tool name, etc.)
   * 3. Inject trace context into request.params._meta for propagation
   * 4. Handle errors and set span status
   *
   * @returns A wrapper function that patches the original request method
   */
  private _patchClientRequest() {
    const instrumentation = this;
    return function (original: (...args: any[]) => Promise<any>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return async function patchedRequest(this: any, ...args: any[]) {
        const request: McpRequest = args[0];
        const method = request.method || 'unknown';

        const span = instrumentation.tracer.startSpan('mcp.client', {
          kind: SpanKind.CLIENT,
          attributes: {
            [MCPSpanAttributes.MCP_METHOD_NAME]: method,
          },
        });

        // Update span name and attributes based on request type
        updateSpanFromRequest(span, request);

        // Add request ID from client instance
        if (this[CLIENT_REQUEST_ID_PROPERTY] !== undefined) {
          span.setAttribute(
            MCPSpanAttributes.MCP_REQUEST_ID,
            this[CLIENT_REQUEST_ID_PROPERTY]
          );
        }

        // Inject trace context into request params._meta
        const ctx = trace.setSpan(context.active(), span);
        const carrier: Record<string, string> = {};
        propagation.inject(ctx, carrier);

        ensureMetaField(request);

        Object.assign(request.params!._meta!, carrier);

        return context.with(ctx, async () => {
          try {
            const result = await original.apply(this, args);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (error: any) {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            throw error;
          } finally {
            span.end();
          }
        });
      };
    };
  }

  /**
   * Create wrapper for Server.prototype.setRequestHandler method.
   *
   * Wraps the handler registration to intercept all incoming requests and:
   * 1. Extract trace context from request.params._meta (propagated from client)
   * 2. Create a SERVER span with mcp.server name as a child of the client span
   * 3. Add MCP-specific attributes (method, tool name, etc.)
   * 4. Handle errors and set span status
   *
   * This enables distributed tracing across MCP client-server boundaries.
   *
   * @returns A wrapper function that patches the original setRequestHandler method
   */
  private _patchServerRequestHandler() {
    const instrumentation = this;
    return function (original: (...args: any[]) => any) {
      return function patchedSetRequestHandler(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: any,
        handler: (...args: any[]) => Promise<any>
      ) {
        const wrappedHandler = async function (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this: any,
          request: McpRequest,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extra?: any
        ) {
          const method = request?.method || 'unknown';

          // Extract trace context from request.params._meta
          const carrier = request?.params?._meta || {};
          const parentCtx = propagation.extract(context.active(), carrier);

          const span = instrumentation.tracer.startSpan(
            'mcp.server',
            {
              kind: SpanKind.SERVER,
              attributes: {
                [MCPSpanAttributes.MCP_METHOD_NAME]: method,
              },
            },
            parentCtx
          );

          // Update span name and attributes based on request type
          updateSpanFromRequest(span, request);

          // Add request ID from extra parameter
          if (extra?.[SERVER_REQUEST_ID_PROPERTY] !== undefined) {
            span.setAttribute(
              MCPSpanAttributes.MCP_REQUEST_ID,
              extra[SERVER_REQUEST_ID_PROPERTY]
            );
          }

          return context.with(trace.setSpan(parentCtx, span), async () => {
            try {
              const result = await handler.call(this, request, extra);
              span.setStatus({ code: SpanStatusCode.OK });
              return result;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              throw error;
            } finally {
              span.end();
            }
          });
        };

        return original.call(this, schema, wrappedHandler);
      };
    };
  }
}
