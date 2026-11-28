import { defineConfig } from 'tsdown';
import baseConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  deps: {
    ...baseConfig.deps,
    // XXX hack until have an api-config release
    neverBundle: ['@opentelemetry/api-config'],
  },
});
