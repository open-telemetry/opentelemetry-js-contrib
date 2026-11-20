import { defineConfig } from 'tsdown';
import baseConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/register.ts'],
  // `utils` loads instrumentations lazily through `createRequire(__filename)`;
  // the ESM output needs `__filename` shimmed to keep that working.
  shims: true,
});
