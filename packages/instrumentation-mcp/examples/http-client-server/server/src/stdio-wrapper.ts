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
 * Stdio wrapper for MCP Inspector compatibility
 * This allows using the MCP Inspector with the same server logic
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { makeHttpCall, makeS3Call } from './testcall.js';

// Create MCP server instance (same as HTTP version)
const server = new McpServer({
  name: 'example-http-server',
  version: '1.0.0'
});

// Add all the same tools, resources, and prompts as HTTP version
server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: `Result: ${a + b}` }]
}));

server.tool('multiply', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: `Result: ${a * b}` }]
}));

server.tool('echo', { message: z.string() }, async ({ message }) => ({
  content: [{ type: 'text', text: message }]
}));

server.tool('awssdkcall', {}, async () => {
  try {
    const result = await makeS3Call();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (_error) {
    return { content: [{ type: 'text', text: 'AWS SDK call failed' }] };
  }
});

server.tool('pingweb', { url: z.string() }, async ({ url }) => {
  try {
    const result = await makeHttpCall(url);
    return { content: [{ type: 'text', text: result }] };
  } catch (_error) {
    return { content: [{ type: 'text', text: 'HTTP call failed' }] };
  }
});

server.resource('file', new ResourceTemplate('file://{path}', { list: undefined }), 
  async (uri, { path }) => ({
    contents: [{ uri: uri.href, text: `File content for: ${path}` }]
  })
);

server.prompt('review-code', { code: z.string() }, ({ code }) => ({
  messages: [{
    role: 'user',
    content: { type: 'text', text: `Please review this code:\n\n${code}` }
  }]
}));

// Use stdio transport for inspector compatibility
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);