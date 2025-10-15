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
 * Example MCP HTTP Server with OpenTelemetry Instrumentation
 * 
 * This server demonstrates:
 * - Basic MCP tools (add, multiply, echo)
 * - External service calls (HTTP, AWS S3)
 * - Resource templates
 * - Prompt templates
 * - Automatic OpenTelemetry tracing
 * - HTTP transport instead of stdio
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { makeHttpCall, makeS3Call } from './testcall.js';
import { createServer } from 'http';
import { URL } from 'url';

// Create MCP server instance
const server = new McpServer({
  name: 'example-http-server',
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
    try {
      const result = await makeS3Call();
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify(result, null, 2) 
        }]
      };
    } catch (_error) {
      console.error('AWS SDK call failed:', _error instanceof Error ? _error.message : String(_error));
      return {
        content: [{ 
          type: 'text', 
          text: 'AWS SDK call failed' 
        }]
      };
    }
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
    try {
      const result = await makeHttpCall(url);
      return {
        content: [{ 
          type: 'text', 
          text: result 
        }]
      };
    } catch (_error) {
      console.error('HTTP call failed:', _error instanceof Error ? _error.message : String(_error));
      return {
        content: [{ 
          type: 'text', 
          text: 'HTTP call failed' 
        }]
      };
    }
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

// Store active transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

/**
 * Start the HTTP server
 * Uses SSE transport for communication
 */
async function main() {
  try {
    console.log('Starting MCP HTTP server...');
    
    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      
      if (url.pathname === '/sse') {
        // Handle SSE connection
        const transport = new SSEServerTransport('/message', res);
        
        // Store transport by session ID
        activeTransports.set(transport.sessionId, transport);
        
        // Clean up on close
        transport.onclose = () => {
          activeTransports.delete(transport.sessionId);
        };
        
        await server.connect(transport);
        
      } else if (url.pathname === '/message') {
        // Handle POST messages
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          res.writeHead(400).end('Missing sessionId');
          return;
        }
        
        const transport = activeTransports.get(sessionId);
        if (!transport) {
          res.writeHead(404).end('Session not found');
          return;
        }
        
        // Handle the POST message
        await transport.handlePostMessage(req, res, undefined);
        
      } else {
        res.writeHead(404).end('Not found');
      }
    });
    
    httpServer.listen(3001, () => {
      console.log('MCP HTTP server started successfully on http://localhost:3001');
    });
  } catch (_error) {
    const errorMessage = _error instanceof Error ? _error.message : String(_error);
    console.error('Failed to start server:', errorMessage);
    throw _error;
  }
}

main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Server startup failed:', errorMessage);
  process.exit(1);
});