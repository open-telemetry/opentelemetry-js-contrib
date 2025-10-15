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
 * Example MCP Client with OpenTelemetry Instrumentation
 *
 * This client demonstrates:
 * - Connecting to an MCP server via stdio transport
 * - Calling tools with arguments
 * - Accessing resources and prompts
 * - Automatic OpenTelemetry tracing
 * - Context propagation to server
 */

import { trace, context } from '@opentelemetry/api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Main client function
 */
async function main() {
  // Create a tracer and root span for the client operation
  const tracer = trace.getTracer('mcp-client');
  const span = tracer.startSpan('mcp-client-operation');

  try {
    await context.with(trace.setSpan(context.active(), span), async () => {
      // Create stdio transport to communicate with server
      const transport = new StdioClientTransport({
        cwd: '../server',
        command: process.execPath,
        args: [
          '--require',
          '@opentelemetry/auto-instrumentations-node/register',
          'build/index.js'
        ],
        env: {
          ...process.env,
          OTEL_SERVICE_NAME: 'mcp-server',
          // OTEL_INSTRUMENTATION_MCP_DEBUG_LOG_FILE: "/tmp/mcp-server-debug.log",
          OTEL_TRACES_EXPORTER: process.env.OTEL_TRACES_EXPORTER || 'otlp',
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces'
        }
      });

      // Create and connect client
      const client = new Client({
        name: 'example-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await client.connect(transport);
      console.log('\nConnected to server:', client.getServerVersion()?.name, 'v' + client.getServerVersion()?.version);

      // List available tools
      console.log('\n=== Available Tools ===');
      const tools = await client.listTools();
      for (const tool of tools.tools) {
        console.log(`- ${tool.name}: ${tool.description || 'No description'}`);
      }

      // Call the 'add' tool
      console.log('\n=== Calling Tool: add ===');
      const addResult = await client.callTool({
        name: 'add',
        arguments: { a: 4, b: 5 }
      });
      const addContent = addResult.content as Array<{ type: string; text: string }>;
      console.log('Result:', addContent[0].text);

      // List resource templates (optional feature)
      console.log('\n=== Resource Templates ===');
      try {
        const templates = await client.listResourceTemplates();
        if (templates.resourceTemplates.length > 0) {
          console.log('Available resource templates:');
          for (const template of templates.resourceTemplates) {
            console.log(`- ${template.name}: ${template.uriTemplate}`);
          }
        }
      } catch (error: any) {
        console.log('Resource templates not available (this is optional)');
      }

      // Get a prompt
      console.log('\n=== Using Prompt ===');
      const prompt = await client.getPrompt({
        name: 'review-code',
        arguments: {
          code: 'console.log("hello");'
        }
      });
      console.log('Prompt:', prompt.messages[0].role);
      console.log('Message:', prompt.messages[0].content.text);

      // Optional: Call external service tools if available
      try {
        console.log('\n=== Calling External Service Tools ===');

        const awsResult = await client.callTool({
          name: 'awssdkcall',
          arguments: {}
        });
        const awsContent = awsResult.content as Array<{ type: string; text: string }>;
        console.log('AWS SDK call:', awsContent[0].text);

        const httpResult = await client.callTool({
          name: 'pingweb',
          arguments: { url: 'http://www.example.com' }
        });
        const httpContent = httpResult.content as Array<{ type: string; text: string }>;
        console.log('HTTP call:', httpContent[0].text);
      } catch (_error) {
        console.log('External service tools not available (this is optional)');
      }

      console.log('\n=== Client completed successfully ===\n');

      // Close the client connection
      await client.close();
    });
  } catch (_error) {
    console.error('Error:', _error);
    span.recordException(_error as Error);
    throw _error;
  } finally {
    console.log('Shutting down client span');
    span.end();
  }
}

// Run the client
main().catch((error) => {
  console.error('Failed to run client:', error);
  process.exit(1);
});
