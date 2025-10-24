# Changelog

## [0.1.0] - Unreleased

### Added

- Initial release of MCP (Model Context Protocol) instrumentation
- Automatic tracing for MCP SDK client requests and server handlers
- Distributed tracing with automatic context propagation via request metadata
- MCP-specific semantic conventions for methods, tools, prompts, and resources
- Debug logging support via configuration or environment variable
- Full CommonJS support with zero-code auto-instrumentation
- Example applications for stdio and HTTP/SSE transports

### Known Limitations

- ESM (ECMAScript Modules) not supported
