// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import nodePlugin from 'eslint-plugin-n';
import headers from 'eslint-plugin-headers';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  eslintPluginPrettier,
  {
    ignores: ['**/build/', '**/version.ts', 'eslint.config.mjs'],
  },
  {
    settings: {
      n: {
        tryExtensions: ['.ts', '.js', '.mjs', '.json', '.node'],
      },
    },
    plugins: { headers },
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.commonjs,
      },
      parserOptions: {
        project: [
          'tsconfig.base.json',
          'detectors/node/*/tsconfig.json',
          'metapackages/*/tsconfig.json',
          'packages/*/tsconfig.json',
          'plugins/node/*/tsconfig.json',
          'plugins/web/*/tsconfig.json',
          'propagators/*/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'n/no-deprecated-api': 'warn',
      'n/no-extraneous-import': [
        'error',
        {
          allowModules: [
            '@opentelemetry/api',
            '@opentelemetry/context-async-hooks',
            '@opentelemetry/otlp-transformer',
            '@opentelemetry/resources',
            '@opentelemetry/sdk-logs',
            '@opentelemetry/sdk-metrics',
            '@opentelemetry/sdk-trace-node',
            '@cucumber/messages',
          ],
        },
      ],
      'n/no-missing-import': [
        'error',
        {
          ignoreTypeImport: true,
        },
      ],
      'no-shadow': 'off',
      'prefer-rest-params': 'off',
      'headers/header-format': [
        'error',
        {
          source: 'string',
          style: 'jsdoc',
          content: `@copyright The OpenTelemetry Authors\n@license Apache-2.0\nLicensed under the Apache License, Version 2.0 (the "License");\nYou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\nhttps://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.`,
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'memberLike',
          modifiers: ['private', 'protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
      ],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreProperties: true },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-shadow': [
        'warn',
        { ignoreOnInitialization: true },
      ],
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-ignore': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
    },
  }
);
