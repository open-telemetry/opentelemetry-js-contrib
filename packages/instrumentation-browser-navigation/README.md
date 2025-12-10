# OpenTelemetry Instrumentation Browser Navigation

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for browser navigation in Web applications. It emits log records via the Logs API to represent:

- **Page load** (hard navigation) - Initial page loads and full page refreshes
- **Same-document navigations** (soft navigations) - History changes, back/forward navigation, and hash changes

The instrumentation supports both traditional browser APIs and the modern [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) when available for improved accuracy and reduced duplicate events.

## Log Record Structure

Each emitted log record has `eventName = browser.navigation` and includes attributes:

- `url.full`: Full URL of the current page
- `browser.navigation.same_document`: boolean, true when navigation is within the same document
- `browser.navigation.hash_change`: boolean, true when the navigation involves a hash change
- `browser.navigation.type`: string indicating navigation type: `push` | `replace` | `reload` | `traverse`

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-browser-navigation
```

## Usage

```ts
import { logs } from '@opentelemetry/api-logs';
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BrowserNavigationInstrumentation } from '@opentelemetry/instrumentation-browser-navigation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const loggerProvider = new LoggerProvider({
  resource: new Resource({ [ATTR_SERVICE_NAME]: '<service-name>' }),
});
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
logs.setGlobalLoggerProvider(loggerProvider);

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      // Enable the instrumentation (default: true)
      enabled: true,
      // Use Navigation API when available for better accuracy (default: true)
      useNavigationApiIfAvailable: true,
    }),
  ],
});
```

## Configuration Options

The instrumentation accepts the following configuration options:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `enabled` | `boolean` | `true` | Enable/disable the instrumentation |
| `useNavigationApiIfAvailable` | `boolean` | `true` | Use the Navigation API when available for better accuracy |
| `sanitizeUrl` | `function` | `undefined` | Callback to sanitize URLs before adding to log records |
| `applyCustomLogRecordData` | `function` | `undefined` | Callback to add custom attributes to log records |

## Navigation API vs Traditional APIs

When `useNavigationApiIfAvailable` is `true` (default), the instrumentation will:

- **Use Navigation API** when available (modern browsers) for single, accurate navigation events
- **Fall back to traditional APIs** (history patching, popstate, etc.) in older browsers
- **Prevent duplicate events** by using only one API set at a time

## URL Sanitization

**Important**: By default, URLs are **not sanitized** and will be recorded as-is. For security and privacy, you should provide a `sanitizeUrl` function to redact sensitive information.

### Using the Default Sanitizer

The package exports a `defaultSanitizeUrl` function that removes credentials and common sensitive query parameters:

```ts
import { BrowserNavigationInstrumentation, defaultSanitizeUrl } from '@opentelemetry/instrumentation-browser-navigation';

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      sanitizeUrl: defaultSanitizeUrl,
    }),
  ],
});
```

The default sanitizer redacts:
- **Credentials**: `https://user:pass@example.com` → `https://REDACTED:REDACTED@example.com`
- **Sensitive parameters**: `password`, `token`, `api_key`, `secret`, `auth`, etc.

### Custom URL Sanitization

You can provide your own sanitization logic:

```ts
const customSanitizer = (url: string) => {
  // Remove all query parameters
  return url.split('?')[0];
};

// Or more targeted sanitization
const targetedSanitizer = (url: string) => {
  return url.replace(/sessionId=[^&]*/gi, 'sessionId=REDACTED');
};

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      sanitizeUrl: customSanitizer,
    }),
  ],
});
```

### No Sanitization

If you want to record URLs without any sanitization (not recommended for production):

```ts
registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      // No sanitizeUrl provided - URLs recorded as-is
    }),
  ],
});
```

## Adding Custom Attributes

If you need to add custom attributes to each navigation event, provide a callback via `applyCustomLogRecordData`:

```ts
const applyCustom = (logRecord) => {
  logRecord.attributes = logRecord.attributes || {};
  logRecord.attributes['example.user.id'] = '123';
};

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({ applyCustomLogRecordData: applyCustom }),
  ],
});
```

## Hash Change Detection

The instrumentation correctly identifies hash changes based on URL comparison:

- **Hash change = true**: When URLs are identical except for the hash part
  - `/page` → `/page#section` ✅
  - `/page#old` → `/page#new` ✅
- **Hash change = false**: When the base URL changes or hash is removed
  - `/page1` → `/page2` ❌
  - `/page#section` → `/page` ❌ (removing hash is not a hash change)

## Navigation Types

- **`push`**: New navigation (link clicks, `history.pushState()`, direct hash changes)
- **`replace`**: Replacing current entry (`history.replaceState()`)
- **`traverse`**: Back/forward navigation (`history.back()`, `history.forward()`)
- **`reload`**: Page refresh

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-browser-navigation
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-browser-navigation.svg

