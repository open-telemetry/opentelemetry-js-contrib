#!/bin/bash

#
# Development script to run MCP server with OpenTelemetry instrumentation
# This script rebuilds and runs the server with OTLP trace export
#

set -e

echo "Cleaning build artifacts..."
rm -rf ./build
rm -rf ./node_modules
rm -f ./package-lock.json

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "Starting MCP server with OpenTelemetry..."
OTEL_SERVICE_NAME=mcp-server \
  OTEL_TRACES_EXPORTER=otlp \
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces \
  node --require @opentelemetry/auto-instrumentations-node/register ./build/index.js
