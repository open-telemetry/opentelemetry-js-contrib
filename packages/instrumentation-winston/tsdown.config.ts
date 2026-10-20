import { defineConfig } from 'tsdown';
import baseConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  deps: {
    ...baseConfig.deps,
    // Loaded by a guarded runtime require only when the user installed it; bundling it
    // would ship a private copy and make the "not available" branch unreachable.
    neverBundle: ['@opentelemetry/winston-transport'],
  },
});
