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
 * Example MCP Server with OpenTelemetry Instrumentation
 *
 * This server demonstrates:
 * - Basic MCP tools (add, multiply, echo)
 * - External service calls (HTTP, AWS S3)
 * - Resource templates
 * - Prompt templates
 * - Automatic OpenTelemetry tracing
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { makeHttpCall, makeS3Call } from './testcall.js';

// Create MCP server instance
const server = new McpServer({
  name: 'example-server',
  version: '1.0.0'
});

/**
 * Tool: add
 * Adds two numbers together
 */
server.tool(
  'add',
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{
      type: 'text',
      text: `Result: ${a + b}`
    }]
  })
);

/**
 * Tool: multiply
 * Multiplies two numbers
 */
server.tool(
  'multiply',
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{
      type: 'text',
      text: `Result: ${a * b}`
    }]
  })
);

/**
 * Tool: echo
 * Echoes back the provided message
 */
server.tool(
  'echo',
  { message: z.string() },
  async ({ message }) => ({
    content: [{
      type: 'text',
      text: message
    }]
  })
);

/**
 * Tool: awssdkcall
 * Makes an AWS S3 API call to list buckets
 * Demonstrates AWS SDK instrumentation
 */
server.tool(
  'awssdkcall',
  {},
  async () => {
    const result = await makeS3Call();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

/**
 * Tool: pingweb
 * Makes an HTTP GET request to the specified URL
 * Demonstrates HTTP instrumentation
 */
server.tool(
  'pingweb',
  { url: z.string() },
  async ({ url }) => {
    const result = await makeHttpCall(url);
    return {
      content: [{
        type: 'text',
        text: result
      }]
    };
  }
);

/**
 * Resource: file
 * Dynamic file resource template
 */
server.resource(
  'file',
  new ResourceTemplate('file://{path}', { list: undefined }),
  async (uri, { path }) => ({
    contents: [{
      uri: uri.href,
      text: `File content for: ${path}`
    }]
  })
);

/**
 * Prompt: review-code
 * Code review prompt template
 */
server.prompt(
  'review-code',
  { code: z.string() },
  ({ code }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please review this code:\n\n${code}`
      }
    }]
  })
);

/**
 * Start the server
 * Uses stdio transport for communication
 */
async function main() {
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((_error) => {
  process.exit(1);
});
