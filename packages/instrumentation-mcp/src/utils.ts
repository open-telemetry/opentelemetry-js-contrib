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

import { Span } from '@opentelemetry/api';
import { MCPSpanAttributes, MCPMethodValue } from './attributes';

/**
 * MCP request interface
 */
export interface McpRequest {
  method?: string;
  params?: {
    name?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arguments?: Record<string, any>;
    uri?: string;
    _meta?: Record<string, string>;
  };
}

/**
 * Update span name and attributes based on MCP request type.
 * Follows semantic conventions from https://github.com/open-telemetry/semantic-conventions/pull/2083
 *
 * @param span - The span to update
 * @param request - The MCP request object
 */
export function updateSpanFromRequest(span: Span, request: McpRequest): void {
  const method = request?.method;
  if (!method) return;

  let spanName: string;

  if (method === MCPMethodValue.TOOLS_CALL && request?.params?.name) {
    spanName = `${MCPMethodValue.TOOLS_CALL} ${request.params.name}`;
    span.updateName(spanName);
    span.setAttribute(MCPSpanAttributes.MCP_TOOL_NAME, request.params.name);

    // Add tool arguments as attributes
    if (request.params.arguments) {
      setArgumentAttributes(span, request.params.arguments);
    }
  } else if (method === 'prompts/get' && request?.params?.name) {
    spanName = `prompts/get ${request.params.name}`;
    span.updateName(spanName);
    span.setAttribute(MCPSpanAttributes.MCP_PROMPT_NAME, request.params.name);
  } else if (
    (method === 'resources/read' || method === 'resources/subscribe') &&
    request?.params?.uri
  ) {
    spanName = `${method} ${request.params.uri}`;
    span.updateName(spanName);
    span.setAttribute(MCPSpanAttributes.MCP_RESOURCE_URI, request.params.uri);
  } else {
    // Generic message - use method name as span name
    spanName = method;
    span.updateName(spanName);
  }
}

/**
 * Set tool argument attributes on span
 *
 * @param span - The span to set attributes on
 * @param arguments - Tool arguments object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setArgumentAttributes(span: Span, args: Record<string, any>): void {
  for (const [argName, argVal] of Object.entries(args)) {
    span.setAttribute(
      `${MCPSpanAttributes.MCP_REQUEST_ARGUMENT}.${argName}`,
      JSON.stringify(argVal)
    );
  }
}

/**
 * Ensure request has params._meta object for trace context injection
 *
 * @param request - The MCP request object
 */
export function ensureMetaField(request: McpRequest): void {
  if (!request.params) {
    request.params = {};
  }
  if (!request.params._meta) {
    request.params._meta = {};
  }
}
