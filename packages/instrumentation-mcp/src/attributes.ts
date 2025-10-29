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

/**
 * MCP (Model Context Protocol) Semantic Conventions
 * Based on: https://github.com/open-telemetry/semantic-conventions/pull/2083
 *
 * WARNING: These semantic conventions are currently in development and are considered unstable.
 */

export const MCPSpanAttributes = {
  MCP_METHOD_NAME: 'mcp.method.name',
  MCP_REQUEST_ID: 'mcp.request.id',
  MCP_TOOL_NAME: 'mcp.tool.name',
  MCP_REQUEST_ARGUMENT: 'mcp.request.argument',
  MCP_PROMPT_NAME: 'mcp.prompt.name',
  MCP_RESOURCE_URI: 'mcp.resource.uri',
  MCP_TRANSPORT_TYPE: 'mcp.transport.type',
  MCP_SESSION_ID: 'mcp.session.id',
} as const;

export const MCPMethodValue = {
  NOTIFICATIONS_CANCELLED: 'notifications/cancelled',
  NOTIFICATIONS_INITIALIZED: 'notifications/initialized',
  NOTIFICATIONS_PROGRESS: 'notifications/progress',
  RESOURCES_LIST: 'resources/list',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  INITIALIZE: 'initialize',
  PROMPTS_GET: 'prompts/get',
} as const;
