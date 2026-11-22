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
import { logs } from '@opentelemetry/api';
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BrowserNavigationInstrumentation } from '@opentelemetry/instrumentation-browser-navigation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const loggerProvider = new LoggerProvider({
  resource: new Resource({ [ATTR_SERVICE_NAME]: '<service-name>' }),
  processors: [
    new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })
  ],
});
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
| `sanitizeUrl` | `function` | `undefined` | Callback to sanitize URLs before adding to log records. **Replaces the default redaction** of credentials and sensitive query parameters, see [URL Sanitization](#url-sanitization) |
| `applyCustomLogRecordData` | `function` | `undefined` | Callback to add custom attributes to log records |

## Navigation API vs Traditional APIs

When `useNavigationApiIfAvailable` is `true` (default), the instrumentation will:

- **Use Navigation API** when available (modern browsers) for single, accurate navigation events
- **Fall back to traditional APIs** (history patching, popstate, etc.) in older browsers
- **Prevent duplicate events** by using only one API set at a time

## URL Sanitization

By default, credentials and the sensitive query string values listed in the [URL semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/url/) are always redacted from `url.full`:

- **Credentials**: `https://user:pass@example.com` → `https://REDACTED:REDACTED@example.com`
- **Query string values** of `sig`, `Signature`, `AWSAccessKeyId`, `X-Goog-Signature`, `X-Amz-Signature`, `X-Amz-Credential` and `X-Amz-Security-Token` (keys are matched case-sensitively): `?sig=abc` → `?sig=REDACTED`

URLs often carry other application-specific secrets (session ids, tokens, OAuth codes, ...). To control redaction yourself, provide a `sanitizeUrl` function.

> [!WARNING]
> Providing `sanitizeUrl` **fully replaces** the default redaction described above. Your function is called with the **raw, unredacted URL**, and whatever it returns is recorded as-is. Credentials and signatures are **not** redacted unless your function does it.
>
> To keep the default redaction and only redact more, build on `defaultSanitizeUrl`, for example `url => defaultSanitizeUrl(url).replace(...)`.

### Using the Default Sanitizer

The package exports a `defaultSanitizeUrl` function that redacts credentials, the keys from the semantic conventions, and a list of other common sensitive query parameters:

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
- **Sensitive parameters**: `password`, `token`, `api_key`, `secret`, `auth`, etc., plus the keys from the semantic conventions listed above

### Custom URL Sanitization

You can provide your own sanitization logic. Keep in mind that it replaces the default redaction, so these examples handle credentials and signatures themselves or on top of `defaultSanitizeUrl`:

```ts
const customSanitizer = (url: string) => {
  // Remove all query parameters (and credentials)
  const parsed = new URL(url);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  return parsed.href;
};

// Or more targeted sanitization, on top of the default
const targetedSanitizer = (url: string) => {
  return defaultSanitizeUrl(url).replace(
    /sessionId=[^&#]*/g,
    'sessionId=REDACTED'
  );
};

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      sanitizeUrl: customSanitizer,
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

